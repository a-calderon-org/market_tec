# ms-catalog

Microservicio de MarketTec que gestiona publicaciones, imágenes y conversaciones entre compradores y vendedores. Usa Node.js 24, TypeScript y Express 5.

## Arquitectura

El servicio sigue una arquitectura hexagonal. Los adaptadores HTTP en `src/adapters/in/http` reciben las solicitudes y llaman a los casos de uso de `src/application`. El dominio en `src/domain` contiene las reglas de publicaciones y mensajería. Los casos de uso acceden a la persistencia y a los servicios externos mediante puertos implementados en `src/adapters/out`. `src/config/catalog-runtime.ts` conecta los adaptadores al arrancar según la configuración del entorno.

- **Publicaciones.** Permite crear, consultar, filtrar, paginar, editar y eliminar publicaciones. El propietario puede cambiar el estado a `activo`, `pausada` o `vendida` mediante `PUT` con un cuerpo que contiene únicamente `estado`.
- **Identidad.** Las rutas de negocio validan el JWT interno RS256 emitido por `ms-users`. El servicio usa el `sub` verificado para comprobar la propiedad y consulta el perfil en `ms-users` al crear una publicación.
- **Persistencia.** Azure Cosmos DB almacena publicaciones, chats y mensajes. El modo `memory` permite probar publicaciones con datos que se pierden al reiniciar.
- **Imágenes.** Azure Blob Storage recibe la carga directa del cliente mediante una URL SAS temporal. El catálogo valida la propiedad y el contenido de la imagen antes de guardar su referencia en la publicación.
- **Mensajería.** Cosmos guarda el mensaje y su evento `message.sent` en una misma transacción. Un proceso en segundo plano envía el evento a Azure Queue Storage para que lo consuma `ms-notifications`.

| Ruta | Función |
|---|---|
| `GET /health` | Estado del proceso |
| `GET`, `POST /v1/publicaciones` | Listar y crear publicaciones |
| `GET`, `PUT`, `DELETE /v1/publicaciones/{publicationId}` | Consultar, editar, cambiar el estado o eliminar |
| `POST /v1/images/upload-url` | Obtener una URL temporal de carga |
| `GET`, `POST /v1/chats` | Listar y abrir conversaciones |
| `GET`, `POST /v1/chats/{chatId}/mensajes` | Listar y enviar mensajes |

Los contratos de publicaciones e imágenes están en el [OpenAPI de catálogo](../../contracts/openapi/catalog.json).

## Instalación local

Instala **Node.js 24** y, desde la raíz del repositorio, ejecuta:

```sh
cd app/ms-catalog
node --version
npm ci
npm run dev
```

Con las variables `CATALOG_*` sin definir, solo se habilita la ruta de salud. Comprueba el arranque desde otra terminal. La respuesta esperada es `200 OK`.

```sh
curl -i http://localhost:3000/health
```

Para probar publicaciones autenticadas, copia [`.env.example`](.env.example) a `.env` y completa estas variables:

| Variable | Valor |
|---|---|
| `CATALOG_PUBLICATIONS_STORE` | `memory` para desarrollo local o `cosmos` para persistencia |
| `CATALOG_JWT_ISSUER` y `CATALOG_JWT_AUDIENCE` | Emisor y audiencia del JWT interno del entorno |
| `CATALOG_JWT_JWKS_URI` o `CATALOG_JWT_JWKS_JSON` | Una sola fuente de claves públicas para validar el JWT |
| `CATALOG_USERS_PROFILE_URL` | URL de `<emisor>/v1/me/profile` para obtener el perfil del vendedor |
| `CATALOG_PLACEHOLDER_IMAGE_URL` | URL de la imagen predeterminada |

Una configuración parcial de publicaciones impide el arranque. Para compilar, ejecutar las pruebas y levantar el servicio con `.env`, usa:

```sh
npm run check
node --env-file=.env dist/src/server.js
```

`npm run check` valida los tipos, compila y ejecuta la suite principal. `npm start` ejecuta el servicio compilado con las variables del entorno del proceso.

## Configuración para Azure

Aprovisiona los recursos antes de iniciar el servicio y usa los valores del entorno de destino en la configuración de App Service.

| Componente | Configuración |
|---|---|
| **Cosmos DB** | Selecciona `cosmos`, configura `CATALOG_COSMOS_ENDPOINT`, `CATALOG_COSMOS_DATABASE` y los tres contenedores. Usa identidad administrada con permisos de datos. Los contenedores usan `/pk` y las políticas de índices definidas en el [ADR-005](../../context/decisions/ADR-005-persistencia-cosmos-catalog.md). El servicio valida la configuración al arrancar. |
| **Blob Storage** | Para activar la carga, configura `CATALOG_BLOB_*`, un contenedor privado de carga y otro con acceso público a nivel de blob. Otorga a la identidad administrada los permisos de datos y de delegación SAS. Habilita CORS de Blob para que la aplicación web pueda subir archivos mediante `PUT`. |
| **Queue Storage** | Para activar las rutas de mensajería y el despacho, configura Cosmos y `CATALOG_MESSAGE_QUEUE_URL` con la cola que consume `ms-notifications`. Otorga a la identidad administrada el rol `Storage Queue Data Message Sender` e incluye `/outboxAvailableAt/?` en el índice del contenedor de mensajes. Mantén activo el proceso de despacho. |
| **API Management** | Configura el JWT del entorno y coordina `CATALOG_APIM_BACKEND_KEY` con la credencial que APIM envía al servicio. Cuando se configura esta clave, la protección se aplica también a `/health`. La aplicación web usa el proxy `/api/catalog-v2`, cuyo destino se define en `MTEC_CATALOG_V2_UPSTREAM`. |

Para validar un despliegue, comprueba `/health` por la ruta autorizada y verifica con una sesión del entorno el alta, el listado y la edición de una publicación propia. Si habilitaste imágenes o mensajería, comprueba también la carga de una imagen y la entrega de `message.sent` a la cola.
