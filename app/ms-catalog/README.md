# ms-catalog

Servicio de catalogo de MarketTec. Usa Node.js 24 (la version declarada en el `.nvmrc` de la raiz), TypeScript y Express 5. Incluye el nucleo de publicaciones. Sin configuracion solo expone `/health`; con la
configuracion de la seccion "Autenticacion real" expone publicaciones autenticadas
con el JWT interno de ms-users. No contiene chats ni integraciones Azure.

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

Las rutas de negocio futuras usarán `/v1`. Cosmos DB, Blob Storage y Azure Queue se incorporarán mediante puertos de salida cuando existan casos de uso. El middleware propaga o genera `X-Correlation-ID`, emite logs JSON, serializa timestamps en Epoch seconds y devuelve errores mediante un envelope estable.

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
contrato HTTP versionado. No hay endpoints de negocio ni autenticacion real y
el servicio no conecta el repositorio en memoria al servidor de produccion.
Cosmos DB corresponde a MTEC-29; imagenes/Blob a MTEC-14.

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

**Verificado localmente (pruebas):** `npm start` monta `GET/POST /v1/publicaciones` y
`GET/PUT /v1/publicaciones/{id}` solo si se configuran las variables siguientes; sin
ninguna, el servidor sigue exponiendo solo `/health`. Una configuracion parcial
detiene el arranque.

| Variable | Valor |
|---|---|
| `CATALOG_JWT_ISSUER` | `iss` de ms-users (staging: `https://markettec-api.azure-api.net/users`) |
| `CATALOG_JWT_AUDIENCE` | `aud` de ms-users (staging: `markettec-api`) |
| `CATALOG_JWT_JWKS_URI` o `CATALOG_JWT_JWKS_JSON` | JWKS publicado, o el documento revisado (`infra/apim/staging/jwks/`) |
| `CATALOG_USERS_PROFILE_URL` | `GET /v1/me/profile` de ms-users a traves de su gateway |
| `CATALOG_PUBLICATIONS_STORE` | `memory` (unico valor; ver limitaciones) |
| `CATALOG_PLACEHOLDER_IMAGE_URL` | URL HTTPS de imagen predeterminada |

- `Authorization: Bearer <JWT>` se verifica en ms-catalog: RS256 con `kid` del JWKS,
  `typ=at+jwt`, `iss`, `aud`, `exp`, `iat`, `sub`, `sid` y `jti`. Firma alterada,
  token expirado, otra clave, otro emisor/audiencia o `alg` distinto producen 401.
  Google y Magic Link usan el mismo JWT; el `userId` es el `sub`, nunca el correo.
- El propietario es el `sub`. Body, `X-User-Id` u otras cabeceras no autentican ni
  asignan propiedad. `PUT` sobre una publicacion ajena devuelve 403.
- Snapshot del vendedor: en POST/PUT se consulta el perfil propio en ms-users con el
  mismo token (no se accede a sus tablas). `nombre` = nombre + apellidos,
  `verificado` del perfil. ms-users no tiene ID numerico ni carrera: `vendedor.id`
  es `null` y `carrera` es `""`. Si ms-users rechaza el token: 401; si no responde o
  el perfil no es del principal: 503 `SELLER_PROFILE_UNAVAILABLE`, sin escritura.
  Las lecturas no consultan ms-users.
- Imagenes: sin adaptador Blob (MTEC-14), solo se aceptan publicaciones sin imagenes.

**Limitaciones:** el unico almacenamiento es en memoria; los datos se pierden al
reiniciar y no se comparten entre replicas. Cosmos DB (MTEC-29) no existe todavia.
Un despliegue con este almacenamiento no constituye integracion E2E persistente.

```bash
CATALOG_JWT_ISSUER=https://markettec-api.azure-api.net/users \
CATALOG_JWT_AUDIENCE=markettec-api \
CATALOG_JWT_JWKS_JSON="$(cat ../../infra/apim/staging/jwks/stg-jwt-2026-11.json)" \
CATALOG_USERS_PROFILE_URL=https://markettec-api.azure-api.net/users/v1/me/profile \
CATALOG_PUBLICATIONS_STORE=memory \
CATALOG_PLACEHOLDER_IMAGE_URL=https://example.invalid/placeholder.svg \
npm start
```

`tests/internal-jwt-auth.test.ts` firma tokens con la forma de `InternalJwtService`
de ms-users y cubre ambos metodos, propiedad, rechazos 401/403/404 y fallos del
perfil. El SPA lo consume con el flag `catalogInternalJwt` mediante el proxy
same-origin `/api/catalog-v2/v1` (`MTEC_CATALOG_V2_UPSTREAM`); el camino heredado
`/api/catalog/v1` con ID Token de Google no cambia.
