# ms-catalog

Servicio de catalogo de MarketTec. Usa Node.js 24, TypeScript y Express 5.
Incluye los nucleos de publicaciones y mensajeria y un adaptador optativo Cosmos
DB for NoSQL. Sin configuracion, el servidor expone solo /health. La seccion
"Autenticacion real" describe como habilitar publicaciones autenticadas con el JWT
interno de ms-users y almacenamiento en memoria.

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

Las rutas de negocio usan `/v1` en la composicion optativa. Cosmos se conecta por puertos de salida. Blob Storage y Azure Queue pertenecen a MTEC-14 y MTEC-31. El middleware propaga o genera `X-Correlation-ID`, emite logs JSON, serializa timestamps en Epoch seconds y devuelve errores mediante un envelope estable.

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

Los filtros usan `sortDirection`, categoria exacta, busqueda por substring en
titulo/descripcion sin distinguir mayusculas, precios inclusivos y paginacion
plana. Predeterminados: pagina 1, tamano 12 (maximo 100), fecha descendente;
empates por ID ascendente. El total se calcula antes de paginar. Son semanticas
locales para probar el nucleo, pendientes de conformidad HTTP con MTEC-32.

Los DTO conservan `fechaPublicacion` ISO string, agregan `createdAt` Epoch seconds
y conservan el vendedor numerico junto a `userId`. El listado omite `imagenes`;
el detalle incluye el arreglo. Revision y propietario interno no se exponen.
El campo adicional no convierte ADR-003 en Accepted.

**Pendiente:** MTEC-32 debe conectar y validar DTO/rutas con el contrato en
revision (`contracts/openapi/catalog.json`); alta y actualizacion aun no tienen
contrato HTTP versionado. La seccion "Autenticacion real" describe el flujo HTTP y sus limites. Imagenes/Blob corresponde a MTEC-14.

## Persistencia Cosmos — MTEC-29

**Verificado localmente (2026-11-10):** `composeCosmosCatalog(client, settings)`
valida los contenedores existentes y devuelve repositorios para publicaciones,
chats y mensajes. La composicion recibe un cliente reutilizable y los nombres de
base/contenedores. Inyectar los repositorios en `PublicationService` y
`MessagingService`. El primero puede conectarse a `createApp` mediante el mismo
puerto HTTP de MTEC-32, mediante la opcion repository de composePublications.
El arranque por variables conserva el almacenamiento en memoria. El SDK oficial `@azure/cosmos` esta fijado en el lockfile.

El [ADR-005](../../context/decisions/ADR-005-persistencia-cosmos-catalog.md)
documenta claves, politicas de indexacion, consistencia, paginacion, alcance
transaccional y limites del incremento. `catalogContainerDefinitions()` devuelve
las definiciones aplicadas por la prueba. Las consultas acotan la particion, cuentan
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
para crear y borrar una base temporal. Genera un nombre unico `mtec29-test-*`,
crea los tres contenedores y borra solo la base creada en esa ejecucion.
La prueba falla si faltan las variables. Usar credenciales externas al repositorio.
Para reproducir el emulador verificado, ejecutar la
[imagen oficial vNext](https://learn.microsoft.com/en-us/azure/cosmos-db/emulator-linux)
en modo HTTPS y publicar su puerto 8081 solo en loopback. Digest probado
`sha256:db53613dae19d0a3d5ad50688d14aa6e957af082dafea56b52e1bd3a6b3f1406`.

**Resultado verificado:** la suite local y la integracion contra el emulador citado pasan. La prueba reutiliza el contrato de repositorios ejecutado contra los fakes y
verifica SQL, conteo, paginacion, colisiones entre clientes, rollback de
mensaje/evento y lectura desde un cliente nuevo. Tambien prueba POST/PUT HTTP con
dos JWT RS256 firmados para la prueba y verifica la revision persistida despues de un 403.
El servidor de pruebas simula el perfil de ms-users con ID numerico nulo.
Los dobles de SDK de `cosmos-repositories.test.ts` cubren errores y reconciliacion.

**Pendiente para la version funcional en Azure:** revisar particiones, rendimiento
de indices y RU con datos representativos. vNext no valida esas propiedades
operativas. El JWT y la resolucion de vendedor se prueban con fixtures. Falta
verificarlos con los servicios de staging. La entrega del evento queda en MTEC-31 y la configuracion
de despliegue en MTEC-33.

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

## Mensajeria — incremento local de MTEC-30

**Verificado 2026-11-09:** `MessagingService` implementa iniciar conversacion,
listar chats del principal, listar mensajes y enviar texto. Las entidades `Chat`,
`Message` y `MessageSent` y sus puertos son independientes de Express, Azure y
ms-users. Los repositorios en memoria son exclusivos del modulo de mensajeria.
No se monta ningun endpoint de chat ni se modifica el servidor o el contrato HTTP.

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
`INVALID_MESSAGE`, `CHAT_NOT_FOUND`, `CHAT_FORBIDDEN` y `CHAT_CONFLICT`; aun no tienen
mapping HTTP contractual. Estos limites y modelos internos no aprueban una API.

`MessageRepository.append(message, event)` exige preparar ambos o ninguno.
El fake comprueba IDs duplicados y correspondencia mensaje/evento antes de insertar,
y copia entradas/salidas. `preparedEvents()` permite inspeccion en tests; no envia,
confirma ni reintenta eventos. `MessageSent` incluye IDs, destinatario derivado,
correlacion y fecha, omitiendo texto/perfiles. Es un evento interno, no el envelope
`message.sent.v1`: admite IDs/correlacion opacos locales, mientras el borrador externo
exige UUID para `eventId`/`correlationId`. La traduccion/validacion corresponde a
MTEC-31 y no debe reenviar valores incompatibles silenciosamente.

**Limites y pendientes para cerrar MTEC-30:** acordar y ampliar Catalog OpenAPI con
inicio/listado de chats y listado/envio de mensajes; definir snapshots confiables
de presentacion, ultimo mensaje y no leidos compatibles con Angular; implementar
adaptador HTTP/DTO y pruebas de integracion; conectar EventPublisher con semantica
de fallo acordada para MTEC-31. El dominio no inventa perfiles, nombres ni contadores
no leidos. La atomicidad del fake no decide almacenamiento productivo, outbox,
transacciones Cosmos o entrega durable. La persistencia de pruebas se documenta
en [MTEC-29](#persistencia-cosmos--mtec-29). JWT, Queue y conformidad del consumidor
ms-notifications siguen pendientes para el flujo integrado.

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
No se ejecutaron CI remoto, Azure ni pruebas HTTP de chat inexistentes.

## MTEC-32 — incremento de lectura HTTP en pruebas

**Verificado localmente:** `createApp(settings, dependencies)` admite composicion
explicita con casos de uso y callback de autenticacion confiable. En esa composicion
expone `GET /v1/publicaciones` y `GET /v1/publicaciones/:publicationId`.
Sin dependencias, incluido `npm start`, las rutas de negocio no se montan.
El callback debe verificar credenciales antes de devolver `userId`; el router no
valida JWT ni acepta identidad desde headers. Solo las pruebas incluyen fake auth.

Listado: respuesta plana `{items,totalRecords,page,pageSize}` y filtros de MTEC-28.
Se rechazan parametros desconocidos/repetidos, arrays/objetos, numeros vacios,
notacion exponencial y limites invalidos. Precios HTTP usan decimal sin signo;
pagina/tamano usan digitos enteros. Errores de dominio usan envelope correlacionado
con 400/404; sin principal valido retorna 401 y errores inesperados retornan 500
sin detalles internos. `X-Correlation-ID` se propaga o genera como en health.

### Pruebas reproducibles antes de integrar

Desde `app/ms-catalog`:

```powershell
npm run check
# Solo HTTP de publicaciones (tras compilar):
node --test dist/tests/publication-http.test.js
# Prueba manual, datos sinteticos y fake auth, solo escucha en loopback:
node dist/tests/fixtures/publication-http-preview.js
```

Con la fixture en ejecucion, en otra terminal:

```powershell
$testHeaders = @{ Authorization = 'Bearer local-test-only'; 'X-Correlation-ID' = 'manual-catalog' }
Invoke-RestMethod 'http://127.0.0.1:3100/v1/publicaciones?sortBy=precio&sortDirection=asc&page=2&pageSize=1' -Headers $testHeaders | ConvertTo-Json -Depth 6
Invoke-RestMethod 'http://127.0.0.1:3100/v1/publicaciones/pub-1' -Headers $testHeaders | ConvertTo-Json -Depth 6
```

La primera respuesta debe contener total 3, pagina 2, tamano 1 y precio 20.
Importar `tests/fixtures/publication-read.postman_collection.json` en Postman y
ejecutar la coleccion contra esa misma fixture: comprueba 200, 400, 401, 404,
correlacion, paginacion y fechas. Detener con Ctrl+C; los datos no persisten.
No ejecutar esa fixture en produccion ni usar credenciales reales.

### Extension de escritura — interfaces aprobadas 2026-11-09

La composicion optativa acepta `writes` con los casos de uso `create`/`update`
y `resolveActor(userId)`, que obtiene un snapshot confiable sin consultar la DB de
ms-users. El resultado debe corresponder al principal ya autenticado. El body
nunca proporciona propietario, vendedor, ID o fecha; campos desconocidos se rechazan.

- `POST /v1/publicaciones`: 201, detalle creado y `Location` relativa.
- `PUT /v1/publicaciones/{publicationId}`: 200, detalle actualizado; solo propietario.
- Cuerpo JSON completo: categoria, subcategoria, titulo, descripcion, precio,
  condicion (string o null) y ubicacion. `imagenes` es opcional; omitirlo implica
  `[]`, tambien en PUT. No hay actualizaciones parciales ni eliminacion.
- Errores 400/401/403/404/409; limite 1 MiB con 413; errores inesperados 500.
  Se autentica antes de parsear JSON. Un fallo de snapshot/imagenes no habilita
  fallback ni escritura parcial. Las URLs se limitan a HTTP(S) sin credenciales.

La fixture manual anterior ahora incluye POST/PUT y un segundo principal de
prueba con `Bearer local-test-other`. La coleccion agrega alta, actualizacion,
403 y rechazo de propietario en body; ejecutar en orden, pues guarda `createdId`.
Ajv 8 y ajv-formats son dependencias exclusivas de desarrollo para validar los
schemas Draft 2020-12 de respuestas reales en `publication-write-http.test.ts`.

**Verificado 2026-11-09:** `npm run check` pasa 69 pruebas; la suite contractual
general `python -m unittest discover -s contracts/tests -p test_contracts.py`
pasa 8 pruebas. La coleccion Postman se ejecuto con Newman 6 contra una fixture
limpia: 9 requests y 24 assertions, sin fallos. Esa ejecucion valida el adaptador
local con fake auth; no es evidencia de interoperabilidad JWT o Azure.

```powershell
# Ejecutar toda la validacion, incluidos JSON Schema y permisos HTTP:
npm run check
# Solo escritura HTTP, tras compilar:
node --test dist/tests/publication-write-http.test.js
```

## Autenticacion real con el JWT interno de ms-users

**Estado:** implementado y verificado con pruebas locales. **No desplegado.** No
existe prueba E2E en staging ni en ningun entorno Azure.

`npm start` monta `GET/POST /v1/publicaciones` y `GET/PUT /v1/publicaciones/{id}`
solo si se configuran las variables siguientes; sin ninguna, el servidor sigue
exponiendo solo `/health`. Una configuracion parcial detiene el arranque.

| Variable | Valor |
|---|---|
| `CATALOG_JWT_ISSUER` | `iss` exacto de ms-users para el entorno |
| `CATALOG_JWT_AUDIENCE` | `aud` exacto del entorno (staging: `markettec-api`, excepcion aprobada solo para staging) |
| `CATALOG_JWT_JWKS_URI` o `CATALOG_JWT_JWKS_JSON` | JWKS publicado, o el snapshot revisado (ver rotacion) |
| `CATALOG_USERS_PROFILE_URL` | Exactamente `<CATALOG_JWT_ISSUER>/v1/me/profile` (ruta del gateway); HTTP solo en loopback local |
| `CATALOG_PUBLICATIONS_STORE` | `memory` (unico valor; provisional) |
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

**Limitaciones:** el almacenamiento es en memoria y provisional; los datos se
pierden al reiniciar y no se comparten entre replicas. Cosmos DB (MTEC-29) no
existe. Ningun despliegue con este almacenamiento constituye integracion E2E
persistente.

### Pruebas

`npm run check` incluye `tests/internal-jwt-auth.test.ts`, que firma tokens con la
forma de `InternalJwtService` y cubre ambos metodos, propiedad, rechazos 401/403/404,
fallos del perfil y la cache del JWKS. Ademas se verifico localmente un token firmado
con Nimbus 10.10 (la libreria de ms-users) contra el servidor compilado, con el
perfil de ms-users simulado en loopback.
