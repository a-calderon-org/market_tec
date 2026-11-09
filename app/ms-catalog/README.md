# ms-catalog

Servicio de catalogo de MarketTec. Usa Node.js 24 (la version declarada en el `.nvmrc` de la raiz), TypeScript y Express 5. Incluye el nucleo local de publicaciones; solo `/health` esta conectado a HTTP. No contiene chats ni integraciones Azure.

El arranque normal conserva ese alcance. Existe tambien un adaptador HTTP de
lectura optativo para pruebas, descrito en la seccion MTEC-32 siguiente.

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

**Pendiente para cerrar MTEC-32:** conformidad del contrato y autenticacion real,
pruebas JSON Schema completas, CRUD/rutas adicionales segun contratos aprobados,
201/403 con casos reales y validacion manual de la coleccion Postman. Los tests de
lectura no certifican APIM, JWT, Cosmos ni conexion de Angular. OpenAPI conserva
`proposed`, ya que la operacion completa aun no tiene conformidad.
