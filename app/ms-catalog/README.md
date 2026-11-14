# ms-catalog

Servicio de catálogo de MarketTec en Node.js 24, TypeScript y Express 5. El arranque normal monta la API de publicaciones con JWT interno y Cosmos cuando se configura el servicio. Sin variables de catálogo expone `/health`.

## Requisitos y ejecucion

```bash
nvm use
cd app/ms-catalog
npm ci
PORT=3000 SERVICE_NAME=ms-catalog npm run dev
curl -i http://localhost:3000/health
```

Verificaciones y ejecucion compilada:

```bash
npm run typecheck
npm run build
npm test
npm start
```

## Arquitectura implementada

El router HTTP de salud es un adaptador de entrada que invoca `GetHealthQuery`; `GetHealthService` implementa ese puerto y devuelve el modelo sin dependencias `ServiceHealth`. `config/container.ts` realiza la composicion manual. No se crean puertos de salida sin comportamiento real.

Las rutas de negocio usan `/v1` en la composición optativa. Cosmos y Azure Queue se conectan por puertos de salida. Blob Storage corresponde a MTEC-14. El middleware propaga o genera `X-Correlation-ID`, emite logs JSON, serializa timestamps en Epoch seconds y devuelve errores mediante un envelope estable.

## Publicaciones — MTEC-28

**Verificado:** `PublicationService` implementa `Publications`: alta, detalle,
actualizacion completa del contenido, listado y listado del propietario inyectado.
`PublicationRepository` tiene un adaptador en memoria con copias defensivas,
insercion sin sobrescritura y reemplazo atomico por revision. Dominio y aplicacion
no importan Express, SDK Azure ni datos de ms-users.

Para composicion local se inyectan repositorio, `ImageStoragePort`, generador de
IDs, reloj y URL HTTP(S) absoluta de imagen predeterminada. El puerto de imagenes
debe rechazar referencias ajenas o no disponibles antes de persistir. Sus dobles
estan en las pruebas; no hay implementacion Blob, subida o borrado de imagenes.
El actor incluye `userId` opaco y snapshot de presentacion confiable, incluido el
ID numerico requerido por Angular. No se deduce ese ID desde `userId` ni se
consulta ms-users. Un adaptador futuro debera obtenerlos de fuentes verificadas.

La actualizacion preserva propietario, fecha, ID y snapshot originales; no permite
transferencia de propiedad. El contenido editable se copia mediante lista explicita
de campos. Por ahora las publicaciones creadas se presentan como `activo`; no hay
transiciones de estado, eliminacion ni reglas de moderacion implementadas.

El caso de uso valida los [filtros de catálogo](#mtec-13--búsqueda-filtros-y-paginación)
antes de enviarlos al repositorio configurado.

Los DTO conservan `fechaPublicacion` ISO string, agregan `createdAt` Epoch seconds
y conservan el vendedor numerico junto a `userId`. El listado omite `imagenes`;
el detalle incluye el arreglo. Revision y propietario interno no se exponen.
El campo adicional no convierte ADR-003 en Accepted.

La interfaz HTTP y su configuración están en [MTEC-32](#mtec-32--api-http-de-publicaciones). Las imágenes se integran en MTEC-14.

## MTEC-14 — Carga de imágenes

1. Con el JWT interno, enviar `POST /v1/images/upload-url` con JSON
   `{"filename":"portada.png","contentType":"image/png"}`. Admite
   `image/jpeg`, `image/png` y `image/webp`. Responde `200` con
   `{"data":{"uploadUrl":"…","publicUrl":"…","expiresAt":1790001800}}`.
2. Enviar los bytes con `PUT` a `uploadUrl`, con `x-ms-blob-type: BlockBlob`
   y el mismo `Content-Type`. Esperar el `201` de Blob Storage. La SAS vence
   a los cinco minutos y permite crear un único blob privado.
3. Enviar `publicUrl` en `imagenes` de `POST /v1/publicaciones` o
   `PUT /v1/publicaciones/{id}`. El servicio verifica que las URLs correspondan al
   propietario autenticado, comprueba los blobs y decodifica y recodifica las
   imágenes antes de guardar el registro. Admite hasta cinco URLs distintas, con
   un máximo de 10 MiB por archivo y 16 megapíxeles. La URL pública está lista
   cuando la escritura de la publicación responde con éxito. El detalle conserva
   el orden en `imagenes` y expone la primera en `imagen`.

Usar la configuración de publicaciones con Cosmos y las variables
`CATALOG_BLOB_*` de [`.env.example`](.env.example). El arranque comprueba los
contenedores aprovisionados. Usar uno privado para carga y otro con acceso
anónimo de nivel `blob` para las imágenes publicadas. La identidad administrada
necesita permisos de lectura y escritura de datos en ambos contenedores y
`Microsoft.Storage/storageAccounts/blobServices/generateUserDelegationKey/action`
en la cuenta. Por ejemplo, asignar `Storage Blob Data Contributor` en cada
contenedor y `Storage Blob Delegator` en la cuenta.

Para el navegador, configurar CORS de Blob para el origen de la SPA con `PUT`
y los encabezados `content-type` y `x-ms-blob-type`. La ruta de emisión utiliza
el mismo JWT interno y la protección de gateway de publicaciones cuando está
configurada. Angular usa el proxy de catálogo con JWT interno. La operación
está documentada en el [OpenAPI compartido](../../contracts/openapi/catalog.json).

La SAS limita el destino, permiso y tiempo. Blob Storage recibe el archivo
antes de que catálogo valide tamaño y contenido. Aplicar una política de ciclo
de vida al contenedor privado para retirar cargas abandonadas, por ejemplo
después de un día. Conservar los blobs públicos mientras puedan estar
referenciados. Una escritura de catálogo fallida puede dejar un blob público
validado disponible para reintentar.

En staging d04, APIM registra `issuePublicationImageUpload` en
`markettec-catalog-stg-v1` y el proxy `/api/catalog-v2` reenvía la operación.
La cuenta dedicada de staging permite CORS de carga desde d04 y elimina
las cargas privadas abandonadas después de un día. El arranque de catálogo
con Cosmos y Blob habilitados y el preflight CORS se verificaron en Azure.

### Verificación con Azurite

Iniciar Azurite Blob 3.37.0 en loopback en una terminal:

```powershell
npm exec --yes --package=azurite@3.37.0 -- azurite-blob --blobHost 127.0.0.1 --inMemoryPersistence --skipApiVersionCheck --silent --disableTelemetry
```

En otra terminal, ejecutar desde `app/ms-catalog`:

```powershell
$env:CATALOG_TEST_BLOB_ENDPOINT = 'http://127.0.0.1:10000/devstoreaccount1'
$env:CATALOG_TEST_BLOB_KEY = '<clave de la cuenta de Azurite>'
npm run test:blob
```

La prueba aprovisiona contenedores efímeros y usa JWT firmado, HTTP y el SDK
de Blob. Verifica SAS, acceso público, formatos, propiedad y escritura de
publicaciones. Usa repositorio de publicaciones en memoria y un doble de
ms-users. Azure con identidad administrada, Cosmos, APIM y el navegador se
validan en sus entornos de integración.

## Persistencia Cosmos — MTEC-29

Con `CATALOG_PUBLICATIONS_STORE=cosmos`, `npm start` compone publicaciones
y mensajeria con repositorios Cosmos. Usa un cliente por proceso, valida el acceso
y la partición de los tres contenedores antes de abrir el puerto HTTP. También
comprueba que la política de publicaciones incluya los campos consultados y los
índices compuestos para los cuatro órdenes de precio y fecha. Si la política es
incompatible, el arranque falla con `CosmosPersistenceError` en `validate`.
Aplicar la política indicada abajo y esperar a que Cosmos termine de construir
los índices antes de habilitar tráfico. Al parar, el proceso cierra el cliente.
La configuración de Queue habilita las rutas y el despacho descritos en MTEC-31.

Configurar las variables JWT, perfil y placeholder de la seccion de autenticacion,
mas `CATALOG_COSMOS_ENDPOINT` (origen HTTPS) y `CATALOG_COSMOS_DATABASE`. Los
nombres de contenedor y sus valores por defecto estan en `.env.example`. El
proceso lee el entorno al arrancar. Con Node 24 tambien puede cargarse un archivo
local mediante `node --env-file=.env dist/src/server.js` despues de `npm run build`.

Cosmos usa Managed Identity asignada por el sistema por defecto. Indicar
`CATALOG_COSMOS_MANAGED_IDENTITY_CLIENT_ID` si se configura una identidad
asignada por el usuario. Para emulador o un entorno autorizado con clave, inyectar
`CATALOG_COSMOS_KEY` desde fuera del repositorio. El operador prepara la base, los
tres contenedores y los permisos de metadata, consulta y escritura antes del
arranque. El servicio no aprovisiona recursos al arrancar.

El [ADR-005](../../context/decisions/ADR-005-persistencia-cosmos-catalog.md)
documenta claves, politicas de indexacion, consistencia, paginacion, alcance
transaccional y limites del incremento. `catalogContainerDefinitions()` devuelve
las definiciones para provisionar los contenedores. Tras compilar se pueden
inspeccionar desde `app/ms-catalog` con:

```powershell
node --input-type=module -e "import { catalogContainerDefinitions } from './dist/src/config/cosmos-catalog.js'; console.log(JSON.stringify(catalogContainerDefinitions(), null, 2))"
```

Las consultas acotan la particion, cuentan
con los mismos filtros que el listado y mantienen el orden estable. El conteo y
el listado son lecturas separadas.

### Validacion reproducible

Ejecutar desde `app/ms-catalog` con Node 24:

```powershell
npm ci
npm run check
# Proporcionar COSMOS_TEST_ENDPOINT y COSMOS_TEST_KEY en el entorno del proceso.
# Para emulador HTTPS, NODE_EXTRA_CA_CERTS debe apuntar a su cadena PEM confiable.
npm run test:cosmos
```

`test:cosmos` requiere un emulador NoSQL o cuenta dedicada de pruebas con permiso
para crear y borrar bases temporales. Genera nombres únicos `mtec29-test-*` y
`mtec31-test-*`, crea los tres contenedores por base y elimina las bases de esa
ejecución.
La prueba falla si faltan las variables. Usar credenciales externas al repositorio.
Para reproducir el emulador verificado, ejecutar la
[imagen oficial vNext](https://learn.microsoft.com/en-us/azure/cosmos-db/emulator-linux)
en modo HTTPS y publicar su puerto 8081 solo en loopback. Digest probado
`sha256:db53613dae19d0a3d5ad50688d14aa6e957af082dafea56b52e1bd3a6b3f1406`.

La prueba reutiliza el contrato de repositorios ejecutado contra los fakes y
verifica SQL, conteo, paginacion, colisiones entre clientes, rollback de
mensaje/evento y lectura desde un cliente nuevo. Usa la misma composicion que
`npm start` para probar POST/PUT HTTP con dos JWT RS256, comprobar que un 403
preserva la publicacion y enviar y recuperar un mensaje desde dos instancias.
El servidor de pruebas simula el perfil de ms-users con ID numerico nulo.
Los dobles de SDK de `cosmos-repositories.test.ts` cubren errores y reconciliacion.

**Verificado en Azure de pruebas en MTEC-29 (2026-11-11):** Managed Identity,
persistencia, concurrencia, RU e índices. El [ADR-005](../../context/decisions/ADR-005-persistencia-cosmos-catalog.md)
registra la evidencia y el alcance aprobado. MTEC-33 cubre el despliegue de
ms-catalog y MTEC-31 la entrega de eventos.

### Validacion de los criterios de MTEC-28

Ejecutar `npm run check` desde `app/ms-catalog` con Node 24: comprueba tipos,
compila y ejecuta pruebas HTTP de salud, del nucleo de publicaciones y de limites
de dependencias. `tests/publications.test.ts` cubre permisos, inexistencia,
validaciones de alta/actualizacion, filtros, paginacion, aislamiento y concurrencia.
`tests/architecture.test.ts` restringe imports de dominio/aplicacion a capas internas,
incluidos imports de tipos; no constituye un analisis exhaustivo de codigo dinamico.

La prueba de compatibilidad compara claves requeridas/permitidas de los DTO y
valores predeterminados de paginacion con el borrador OpenAPI vigente. No sustituye
validacion completa JSON Schema ni conformidad HTTP de MTEC-32. CI observa tambien
`contracts/openapi/catalog.json` para ejecutar esta comprobacion ante cambios del
borrador. Los casos nulos/malformados producen `INVALID_PUBLICATION`, y las
actualizaciones rechazadas conservan el contenido anterior.

## Mensajería — MTEC-30

**Verificado 2026-11-09:** `MessagingService` implementa iniciar conversacion,
listar chats del principal, listar mensajes y enviar texto. Las entidades `Chat`,
`Message` y `MessageSent` y sus puertos son independientes de Express, Azure y
ms-users. Los repositorios en memoria se usan en pruebas. La composición
persistente de MTEC-31 habilita las rutas de mensajería descritas abajo.

El principal autenticado se inyecta desde una frontera confiable. La conversacion
se inicia entre el solicitante y el propietario real de una publicacion existente;
se rechaza contactar consigo mismo. Una pareja `(publicationId, buyerId)` tiene
un solo chat, incluso con llamadas concurrentes sobre el mismo repositorio fake.
Los participantes quedan fijados al iniciar la conversacion. No hay transferencia
de propiedad, incorporacion de participantes ni conversaciones grupales.

Solo participantes pueden leer/enviar mensajes. Remitente y destinatario se derivan
del principal y del chat; no hay parametros de entrada para suplantarlos. El caso
de uso autoriza antes de consultar el repositorio de mensajes. Los listados filtran
por participante/chat antes de contar y paginar. Pagina predeterminada 1, tamano 12,
maximo 100; pagina fuera de rango devuelve lista vacia con total conservado.
Chats: creacion descendente; mensajes: envio ascendente; empates por ID ascendente.
Se usa paginacion offset local, sin garantizar una instantanea entre solicitudes
con escrituras concurrentes ni eficiencia equivalente en Cosmos.

Reglas locales: texto no vacio de hasta 5000 unidades UTF-16, sin recortar contenido;
IDs de recursos hasta 128, `userId` hasta 64, correlacion no vacia hasta 128.
Reloj inyectado en Epoch seconds enteros (0..9999999999). Los errores internos son
`INVALID_MESSAGE`, `CHAT_NOT_FOUND`, `CHAT_FORBIDDEN` y `CHAT_CONFLICT`. El adaptador
HTTP responde respectivamente con 400, 404, 403 y 409.

`MessageRepository.append(message, event)` exige preparar ambos o ninguno.
El fake comprueba IDs duplicados y correspondencia mensaje/evento antes de insertar,
y copia entradas/salidas. `preparedEvents()` permite inspeccion en tests; no envia,
confirma ni reintenta eventos. `MessageSent` incluye IDs, destinatario derivado,
correlacion y fecha, omitiendo texto/perfiles. El puerto interno admite IDs
opacos locales. La composición de MTEC-31 valida los UUID de evento y correlación
antes de confirmar nuevas escrituras en Cosmos.

**Limites y pendientes para cerrar MTEC-30:** acordar y ampliar Catalog OpenAPI con
inicio/listado de chats y listado/envio de mensajes; definir snapshots confiables
de presentación, último mensaje y no leídos compatibles con Angular. El listado
HTTP interno devuelve los campos de dominio. La persistencia está descrita en
[MTEC-29](#persistencia-cosmos--mtec-29).

Validacion reproducible con Node 24 desde `app/ms-catalog`:

```powershell
npm run check
# Solo mensajeria, despues de compilar:
node --test dist/tests/messaging.test.js
```

**Verificado:** tipos, compilacion y 89/89 pruebas locales correctas, incluidas
20 de mensajeria: aislamiento, ambos sentidos, concurrencia entre casos de uso
con repositorio compartido, paginacion, validacion, colisiones, fallo de persistencia
y copias defensivas. La prueba de arquitectura cubre tambien el nuevo modulo.

## MTEC-31 — Entrega de `message.sent` v1

`npm start` habilita mensajería cuando se configuran Cosmos y
`CATALOG_MESSAGE_QUEUE_URL`. Provisionar la misma cola de entrada que consume
`ms-notifications`. Usar el formato
`https://<cuenta>.queue.core.windows.net/<cola>` y asignar a la identidad de
`ms-catalog` el rol de datos **Storage Queue Data Message Sender** en esa cola.
El SDK usa Managed Identity del sistema por defecto. Para una identidad asignada
por el usuario, definir `CATALOG_MESSAGE_QUEUE_MANAGED_IDENTITY_CLIENT_ID`.
En el contenedor Cosmos de mensajes, agregar `/outboxAvailableAt/?` a los
`includedPaths` y esperar a que termine la transformación del índice antes de
habilitar el flujo. El arranque valida que la ruta esté cubierta por la política.
En App Service, el despacho requiere que el proceso permanezca activo.

| Ruta del servicio | Entrada y respuesta |
|---|---|
| `POST /v1/chats` | `{ "publicationId": "…" }` → 200 con el chat existente o creado |
| `GET /v1/chats` | `page`, `pageSize` → página de chats del principal |
| `GET /v1/chats/{id}/mensajes` | `page`, `pageSize` → página de mensajes para participantes |
| `POST /v1/chats/{id}/mensajes` | `{ "texto": "…" }` → 201 con `{ "data": { "id": "…", "createdAt": 1790000100 } }` |

Todas las rutas requieren el JWT interno existente. Se conserva un
`X-Correlation-ID` UUID válido. Si falta o es incompatible con el esquema de
eventos, el servicio genera un UUID y lo devuelve en el encabezado. El código 201
confirma la persistencia conjunta del mensaje y su evento. La entrega a Queue
ocurre en segundo plano.

El dispatcher consulta un lote de hasta 20 eventos cada dos segundos después de
terminar el lote anterior. Procesa hasta cuatro en paralelo. Cada intento reclama
una reserva de 60 segundos mediante ETag. Tras un error de publicación, el evento
queda en Cosmos con el siguiente intento programado, desde 5 segundos hasta un
máximo de 5 minutos entre intentos. Si el proceso termina durante un envío o falla
la confirmación en Cosmos, la reserva vence y el mismo `eventId` se vuelve a
publicar. La entrega es **al menos una vez**, sin garantía de orden global. La
deduplicación del consumidor se basa en `eventId`. Los eventos confirmados se
conservan con `outboxPublishedAt` y quedan fuera de la selección de pendientes.

El publicador emite JSON UTF-8 sin Base64, sin texto del mensaje ni datos de
perfil. Usa `messageTimeToLive: -1` para evitar el vencimiento durante una parada
del consumidor. El [contrato compartido](../../contracts/events/MESSAGE_SENT_V1.md)
define el envelope y sigue en borrador. Los eventos de MTEC-29 sin metadatos de
entrega también entran al despacho. Si un registro previo contiene UUID inválidos,
queda pendiente con reintentos y un log de error. Corregirlo requiere verificar
el mensaje y la correlación de origen. El servicio conserva sus identificadores
durante los reintentos.

Para investigar fallos, buscar `message_outbox_failed` por `stage`, `eventId` o
`outboxId`. Revisar el índice y los permisos de Cosmos si falla `poll` o `claim`,
y el destino, la identidad y el acceso a Queue si falla `publish`. Un fallo en
`complete` puede dar lugar a una nueva entrega del mismo evento. Los reintentos
se reanudan al recuperar la dependencia.

Ejecutar `npm run check` para validar los dos esquemas compartidos, el origen del
destinatario, la correlación HTTP y la recuperación ante fallos parciales.
`npm run test:cosmos` cubre además la recuperación desde otro cliente Cosmos
y la concurrencia de los dispatchers en una base temporal de pruebas.

## MTEC-13 — Búsqueda, filtros y paginación

`GET /v1/publicaciones` requiere un JWT interno válido. Los parámetros del
[OpenAPI de catálogo](../../contracts/openapi/catalog.json) son opcionales y se
pueden combinar.

| Parámetro | Comportamiento |
|---|---|
| `categoria` | Coincidencia exacta, hasta 100 caracteres. Vacío omite el filtro. |
| `q` | Subcadena en el título y la descripción, hasta 200 caracteres. Quita espacios en los extremos e ignora mayúsculas. Conserva los acentos. |
| `precioMin`, `precioMax` | Límites inclusivos y no negativos. Aceptan decimales y notación científica. |
| `sortBy`, `sortDirection` | `fecha` o `precio`, `asc` o `desc`. Predeterminado `fecha` descendente. Los empates se resuelven por ID ascendente. |
| `page`, `pageSize` | Enteros positivos. Predeterminados `1` y `12`. Tamaño máximo `100`. |

Con `CATALOG_PUBLICATIONS_STORE=cosmos`, Cosmos aplica los filtros antes de
paginar. La respuesta plana `{items,totalRecords,page,pageSize}` contiene solo
la página pedida y el total exacto de la consulta de conteo con esos filtros.
Si la página está fuera de rango, `items` queda vacío y se conserva el total.
Las escrituras concurrentes pueden cambiar los datos entre la lectura del
conteo y la de la página. Una consulta inválida recibe `400 INVALID_PUBLICATION`.

Ejemplo de ruta relativa:

```text
/v1/publicaciones?categoria=Libros&q=%C3%A1lbum&sortBy=precio&sortDirection=asc&page=2&pageSize=12
```

## MTEC-32 — API HTTP de publicaciones

El [OpenAPI de catálogo](../../contracts/openapi/catalog.json) define listado,
detalle, alta y actualización. El listado conserva la página plana
`{items,totalRecords,page,pageSize}`, `sortDirection` y los filtros de texto,
categoría y precio. Las escrituras reciben el cuerpo de publicación de Angular.
El alta responde `201` con `Location`. Los errores del servicio llevan
`X-Correlation-ID` y el mismo identificador en el cuerpo. Las interfaces de
escritura fueron aprobadas el 2026-11-09. El contrato general sigue en revisión.

### Autenticacion real con el JWT interno de ms-users

**Verificado en código y pruebas locales:** HTTP, JWT y Cosmos se componen al arrancar el servicio. **No determinado:** resultado E2E con sesiones reales por APIM y SWA.

`npm start` monta `GET/POST /v1/publicaciones` y `GET/PUT /v1/publicaciones/{id}`
solo si se configuran las variables siguientes; sin ninguna, el servidor sigue
exponiendo solo `/health`. Una configuracion parcial detiene el arranque.

| Variable | Valor |
|---|---|
| `CATALOG_JWT_ISSUER` | `iss` exacto de ms-users para el entorno |
| `CATALOG_JWT_AUDIENCE` | `aud` exacto del entorno (staging: `markettec-api`, excepcion aprobada solo para staging) |
| `CATALOG_JWT_JWKS_URI` o `CATALOG_JWT_JWKS_JSON` | JWKS publicado, o el snapshot revisado (ver rotacion) |
| `CATALOG_USERS_PROFILE_URL` | Exactamente `<CATALOG_JWT_ISSUER>/v1/me/profile` (ruta del gateway); HTTP solo en loopback local |
| `CATALOG_PUBLICATIONS_STORE` | `cosmos` para persistencia, `memory` para un proceso local efimero |
| `CATALOG_PLACEHOLDER_IMAGE_URL` | URL HTTPS de imagen predeterminada |

### Perfil de token aceptado

Conforme al [contrato de identidad §6](../../contracts/identity/IDENTITY_CONTRACT.md#6-jwt-jwks-y-metadata-perfil-aprobado-interfaz-draft)
y a `InternalJwtService` de ms-users: `Authorization: Bearer <JWT>` con RS256,
`typ=at+jwt`, `kid` presente en el JWKS configurado, `iss` y `aud` (string unica)
iguales a la configuracion, `sub` de 1 a 64 caracteres, `sid` y `jti` hexadecimales
de 32, `iat`/`exp` enteros con `0 < exp-iat <= 240`, `exp` ya vencido en igualdad y
sin tolerancia positiva de reloj (como `clock-skew="0"` de APIM). Se rechazan
`alg` distinto, claves embebidas o remotas (`jwk`, `jku`, `x5u`, `x5c`) y `crit`.
Google y Magic Link producen el mismo JWT; el propietario es el `sub`, nunca el
correo, el body ni cabeceras como `X-User-Id`.

- **Alta:** el snapshot del vendedor sale del perfil propio en ms-users
  (`GET /v1/me/profile`, mismo token). `nombre` = nombre + apellidos y
  `verificado` del perfil; ms-users no tiene ID numerico ni carrera, por lo que
  `vendedor.id` es `null` y `carrera` es `""`. Perfil 401 → 401; perfil no
  disponible o de otro usuario → 503 `SELLER_PROFILE_UNAVAILABLE`, sin escritura.
- **Actualizacion:** solo el propietario (`sub`); conserva propietario, fecha y
  snapshot. No consulta ms-users. Lecturas tampoco.
- **Imagenes:** sin adaptador Blob (MTEC-14) solo se aceptan publicaciones sin imagenes.

### Valores reales de staging — verificacion de solo lectura, 2026-11-10

| Dato | Valor | Evidencia |
|---|---|---|
| `iss` | `https://markettec-api.azure-api.net/users` | `USERS_INTERNAL_JWT_ISSUER` de `ca-ms-users-stg` y `<issuer>` de la politica APIM `getOwnUserProfile` |
| `aud` | `markettec-api` | `USERS_INTERNAL_JWT_AUDIENCE` y `<audience>` de la misma politica |
| `kid` activo | `stg-jwt-2026-11` | `USERS_INTERNAL_JWT_ACTIVE_KID` |
| Clave publica | `infra/apim/staging/jwks/stg-jwt-2026-11.json` | `kid`, `n` y `e` identicos a la `<key>` de `validate-jwt` en APIM `markettec-users-v1` |
| JWKS publico | No disponible | `GET https://markettec-api.azure-api.net/users/v1/.well-known/jwks.json` responde 404 `OPERATION_NOT_RELEASED`; el Container App exige autenticacion de gateway |

Imagen de ms-users en staging: `ms-users:be4595c`. El secreto de claves se
actualizo por ultima vez el 2026-11-09T17:53Z, antes del commit del snapshot
(2026-11-09T20:04Z). **Inferido, no verificado criptograficamente:** el snapshot es
la clave publica real porque APIM valida con ella los JWT reales de staging. La
verificacion directa requiere un JWT real de staging (paso 1 de la validacion E2E).
No se leyo el secreto privado.

**Aprobado el 2026-11-10, solo staging** ([ADR-004 §10](../../context/decisions/ADR-004-seguridad-autenticacion.md#aprobaciones-delimitadas-ms-users--ms-catalog--2026-11-10)):

- **Audiencia:** ms-catalog acepta `aud=markettec-api`, la audiencia compartida
  del entorno, con la validacion estricta anterior. No autoriza recursos (la
  propiedad la decide el `sub`) ni se aplica a produccion. El codigo no fija ningun valor.
- **Delegacion acotada:** el JWT, ya verificado, solo se reenvia a
  `GET <issuer>/v1/me/profile` por el gateway. `settings.ts` rechaza cualquier otra
  URL o query; la llamada usa `redirect: 'error'`, solo envia `Authorization` y
  `Accept`, no guarda ni registra el token, y exige `id = sub`. No se reutiliza para
  otras operaciones entre servicios.
- **Topologia (lectura de politica APIM, 2026-11-10):** `markettec-users-v1`
  `getOwnUserProfile` no exige Origin ni cookies, elimina `X-User-Id`, valida el
  mismo perfil JWT y reenvia a ms-users con identidad administrada. Una peticion sin
  token responde 401 `Invalid internal token`. **No verificado:** respuesta 200 con
  un JWT real desde ms-catalog.
- **Tiempo:** la consulta del perfil se corta a los 20 s, por debajo del limite de
  38 s del proxy same-origin; si ms-users arranca en frio (35-47 s medidos), el alta
  responde 503 `SELLER_PROFILE_UNAVAILABLE` sin escribir y puede reintentarse.

### Fuente de claves y rotacion

- **Preferida:** `CATALOG_JWT_JWKS_URI` con el JWKS publico de ms-users. Cache de
  5 min, refresco ante `kid` desconocido como maximo cada 30 s y confianza en las
  ultimas claves verificadas solo hasta 10 min tras su obtencion; despues, rechazo.
  Requiere liberar `getPublicSigningKeys` en APIM (no realizado).
- **Provisional:** `CATALOG_JWT_JWKS_JSON` con el mismo snapshot revisado que usa
  APIM (`infra/apim/staging/jwks/`). Se rechaza material privado y `kid` duplicado.
  Antes de cada despliegue, comparar el snapshot con la clave de APIM:

```bash
az rest --method get --url "https://management.azure.com/subscriptions/<sub>/resourceGroups/markettec-dev/providers/Microsoft.ApiManagement/service/markettec-api/apis/markettec-users-v1/operations/getOwnUserProfile/policies/policy?api-version=2022-08-01&format=rawxml" \
  --query properties.value -o tsv | grep -o '<key id="[^"]*" n="[^"]*" e="[^"]*"'
jq -r '.keys[] | "\(.kid) \(.n) \(.e)"' infra/apim/staging/jwks/stg-jwt-2026-11.json
```

Rotacion normal con snapshot (ADR-004 §3.3): (1) agregar la nueva clave publica
al snapshot junto a la actual; (2) desplegar ese JWKS en APIM y en ms-catalog y
verificar ambos; (3) cambiar `USERS_INTERNAL_JWT_ACTIVE_KID` en ms-users; (4) tras
al menos 240 s mas la cache de APIM, retirar la clave anterior en ambos. Ante
compromiso: retirar la clave en APIM y ms-catalog a la vez o suspender rutas.

**Cuerpos HTTP (CAT-001, resuelto):** `body-parser@2.4.0` (corrige
GHSA-27r3-jxmh-p828; `npm audit` sin vulnerabilidades). POST/PUT admiten JSON
plano o comprimido (`gzip`, `deflate`, `br`) hasta 1 MiB tras descomprimir.
JSON vacio, invalido o truncado y datos comprimidos corruptos dan 400; mas de 1 MiB
da 413 `PAYLOAD_TOO_LARGE`; codificacion o charset no soportados dan 415
`UNSUPPORTED_MEDIA_TYPE`. Ningun error repite el cuerpo recibido.

Con `CATALOG_PUBLICATIONS_STORE=memory`, los datos se pierden al reiniciar y
cada replica tiene sus propios datos. Para persistir, configurar el modo
`cosmos` descrito en [MTEC-29](#persistencia-cosmos--mtec-29).

### Pruebas

`npm run check` incluye `tests/internal-jwt-auth.test.ts`, que firma tokens con la
forma de `InternalJwtService` y cubre ambos metodos, propiedad, rechazos 401/403/404,
fallos del perfil y la cache del JWKS. Ademas se verifico localmente un token firmado
con Nimbus 10.10 (la libreria de ms-users) contra el servidor compilado, con el
perfil de ms-users simulado en loopback.

### Publicación del catálogo en producción (propuesta para MTEC-33)

En Azure, los App Service de catálogo usan `CATALOG_COSMOS_DATABASE=markettec`.
La base comparte 400 RU/s entre sus contenedores. Staging configura
`publicaciones-stg`, `chats-stg` y `mensajes-stg`. Producción configura los
equivalentes con sufijo `-prod`, inicializados vacíos. Cada identidad administrada
tiene acceso limitado a los tres contenedores de su entorno. La cuenta comparte
el límite gratuito de almacenamiento de 25 GB entre los dos entornos.

La API independiente `markettec-catalog-v2` existe en APIM con el sufijo
`catalog-v2`, HTTPS y suscripción obligatoria. Su activación contempla
`GET` y `POST /v1/publicaciones` y `GET` y `PUT /v1/publicaciones/{publicationId}`
del [contrato de catálogo](../../contracts/openapi/catalog.json). El sufijo de
APIM distingue el servicio de la API heredada y conserva las rutas v1 del contrato.
Al desplegar la eliminación, registrar `DELETE /v1/publicaciones/{publicationId}`
en APIM con la autenticación de `PUT`. El servicio devuelve `204` tras eliminar
el registro propio. Los archivos de imagen y las conversaciones se conservan.

La configuración de Cosmos del App Service de producción ya apunta a los
contenedores vacíos. Para activar el servicio, verificar el emisor, la audiencia
y el JWKS de producción, así como la consulta del perfil del vendedor. Las aprobaciones
vigentes de identidad y delegación están delimitadas a staging en el
[ADR-004](../../context/decisions/ADR-004-seguridad-autenticacion.md#aprobaciones-delimitadas-ms-users--ms-catalog--2026-11-10).

Con esos valores verificados, desplegar el catálogo y aplicar en la API nueva
la validación JWT y la protección de origen con credenciales de producción.
Desde la raíz del repositorio, generar la política con los valores aprobados:

```powershell
python infra/apim/staging/build_catalog_policy.py --jwks $catalogJwks --issuer $catalogIssuer --audience $catalogAudience --gateway-named-value catalog-v2-backend-key --output $catalogPolicyFile
```

Configurar en APIM el valor secreto `catalog-v2-backend-key` con la misma
credencial de origen que usa el App Service en `CATALOG_APIM_BACKEND_KEY`.
Conectar únicamente el proxy de catálogo de SWA al sufijo de APIM mediante
`MTEC_CATALOG_V2_UPSTREAM`, y configurar el build según la
[guía de integración](../../context/integration/FRONTEND_BACKEND.md#despliegue-del-catálogo-con-auth-core-v2).
Antes de dar el cambio por terminado, comprobar el rechazo de acceso directo y
validar en producción con una cuenta autorizada el alta, el listado filtrado y
la persistencia tras recargar. Registrar el artefacto SWA y los ajustes previos
del proxy para poder restaurarlos si falla la validación.

### Validación en staging con credenciales reales

Importar [la colección Postman](tests/fixtures/publications-integration.postman_collection.json)
y ejecutarla en orden. La ejecución crea dos publicaciones persistentes en una
base de catálogo autorizada para pruebas de staging.

1. Configurar `baseUrl` con el prefijo HTTPS de catálogo en APIM y mantener
   `authorizationHeader=Authorization`. Configurar `catalogSubscriptionKey`
   como variable sensible si APIM requiere clave. Para SWA, usar el prefijo
   `/api/catalog-v2` de su origen y `authorizationHeader=X-MTEC-Authorization`.
2. Iniciar sesión en ms-users de staging con Google y Magic Link en dos cuentas
   distintas. Cargar los access tokens vigentes como variables locales y sensibles
   `googleToken` y `magicToken`. Ejecutar antes de que caduquen.
3. Confirmar alta desde ambas sesiones, listado, detalle, edición del propietario,
   403 al tercero y errores 400/401/404. Registrar la versión del servicio y la
   correlación de la respuesta.

Para pruebas locales aisladas, usar `npm run check` o la
[colección con datos sintéticos](tests/fixtures/publication-read.postman_collection.json)
contra `node dist/tests/fixtures/publication-http-preview.js` tras compilar.
