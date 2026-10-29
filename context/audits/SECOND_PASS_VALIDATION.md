# Segunda auditoría independiente y validación

> **Estado posterior verificado (2026-10-29, MTEC-17):** SPV-003 y SPV-004 fueron corregidos en el frontend mediante validación estructural de URL, expiración programada y una fuente reactiva única de sesión. La suite incorpora casos negativos de destinos/configuración y pruebas con reloj simulado, concurrencia y respuestas tardías. Este apunte actualiza el estado del hallazgo sin reescribir la evidencia histórica del análisis siguiente; las políticas APIM continúan **No determinadas**.

## A. Información de la revisión

- **Fecha:** 2026-10-13.
- **Rama / commit:** `refactor/pagination`, `30ff761b5a50fb76321571be51edae4663c166b7`.
- **Estado inicial:** el código coincidía con `HEAD`; `AGENTS.md` y `context/` eran cambios documentales sin rastrear de la primera auditoría.
- **Alcance:** código, configuración, manifiestos, historial Git relevante, 26 documentos de contexto y 20 hallazgos iniciales.
- **Restricciones:** sin cambios de producto, instalaciones, cambios de runtime, acceso a APIM/Google ni pruebas remotas.
- **Evidencia:** fuentes TypeScript/HTML, manifests/lockfiles, workflow, README/`GOOGLE_LOGIN.md`, historial Git, compilación backend, typecheck Angular, 170 pruebas frontend y auditoría npm offline.

Las auditorías iniciales se conservaron sin cambios. Este documento corrige severidad y certeza sin reescribir el registro histórico.

## B. Resumen ejecutivo

La primera auditoría fue precisa al inventariar el código, contratos y divergencias, pero asignó demasiado peso de seguridad a condiciones cuyo impacto depende de APIM y trató el backend Express como una ausencia de dominio High sin incorporar suficientemente que el README declara explícitamente una Fase I basada en mocks externos.

De 20 hallazgos: **10 confirmados, 7 parcialmente confirmados, 2 condicionados y 1 refutado**. No hubo no confirmados, obsoletos ni vulnerabilidades Critical demostradas. Se redujo la severidad de varias conclusiones: decodificar un JWT en el navegador permite saltar controles de presentación, pero no demuestra acceso no autorizado a datos; `USR-001` demuestra una limitación/defecto multiusuario, pero no IDOR; una subscription key en una SPA es pública por construcción, y su riesgo depende de políticas no disponibles.

Se encontraron cuatro omisiones concretas: paginación inoperante/incompleta en dos consumidores, un bloqueo de navegación al filtrar una página sin coincidencias, comparación insegura por prefijo para adjuntar credenciales y expiración de sesión cliente solo perezosa. El script backend marcado como roto en la primera auditoría sí es resoluble por `tsx`.

## C. Matriz de validación de hallazgos originales

| ID | Estado | Severidad original → revisada | Evidencia y justificación |
|---|---|---|---|
| BE-001 | Parcialmente confirmado | High → Low | Express solo tiene salud (`app.ts:9-13`), pero README:15,233,291 declara APIM mock y backend reservado en Fase I. Es un límite/decisión pendiente, no una falla High demostrada. |
| BE-002 | Condicionado | Medium → Low | `cors()` es permisivo (`app.ts:6`), pero solo protege salud sin datos. El riesgo crecería con rutas sensibles; CORS tampoco sustituye autorización. |
| BE-003 | Confirmado | Medium → Low | No existen pruebas ni scripts test/lint backend (`package.json:7-11`). El impacto actual es bajo por el tamaño y rol auxiliar. |
| BE-004 | Refutado | Medium → N/A | Aunque el script usa `src/server.js`, `node --import tsx src/server.js` resolvió y cargó `server.ts`. Watch no pudo probarse por IPC bloqueado, no por ruta inexistente. |
| BE-005 | Confirmado | Low → Low | No hay validación de `PORT`, error handler, logs estructurados o shutdown (`server.ts:4-7`, `app.ts`). Relevancia condicionada al futuro papel del servicio. |
| FE-001 | Parcialmente confirmado | High → Medium | Tokens `alg:none` con `exp/sub/email` se aceptan localmente y las pruebas lo ejercitan. Esto desbloquea rutas/identidad visual; no demuestra que APIM acepte el bearer fabricado. |
| FE-002 | Parcialmente confirmado | High → Medium | `USR-001` se usa en GET/PUT perfil y publicaciones propias. Es defecto/limitación multiusuario; exposición cruzada depende de autorización externa y no se certifica como IDOR. |
| FE-003 | Condicionado | Medium → Medium | La clave queda en bundle/cabecera. La exposición es cierta; abuso, cuota e impacto dependen de producto/políticas APIM ausentes. |
| FE-004 | Confirmado | Medium → Medium | Home filtra `response.items`; estadísticas de usuario cuentan `items`, aunque la UI presenta totales del universo (`home.html:12-24`; `my-publications.html:55-119`). |
| FE-005 | Parcialmente confirmado | Medium → Low | Las imágenes no entran al POST, pero la UI aclara explícitamente “únicamente como vista previa durante esta sesión” (`publication-create.html:294-297`). Es limitación visible, no pérdida silenciosa. |
| FE-006 | Confirmado | Medium → Low | El ejemplo omite `googleClientId` requerido por el servicio; CI sí genera las tres propiedades. Afecta onboarding, no el pipeline configurado. |
| FE-007 | Confirmado | Medium → Medium | El panel carece de `role=dialog`, `aria-modal`, focus trap, Escape y restauración explícita de foco (`profile.html:1-14`, `app.ts:39-45`). |
| FE-008 | Confirmado | Low → Low | 18 suites unitarias, sin target E2E ni auditoría a11y (`angular.json:20-78`). |
| FE-009 | Confirmado | Low → Low | Solo 401 es global; otros errores se traducen de forma desigual y no hay contrato tipado (`api-key.interceptor.ts:30-40`, `profile.ts:358-375`). |
| INT-001 | Parcialmente confirmado | High → Low | Express no satisface los ocho consumidores, pero la SPA está diseñada/documentada para APIM mock y CI no despliega backend. La incompatibilidad local existe; no contradice necesariamente la arquitectura de Fase I. |
| INT-002 | Confirmado | High → Medium | `GOOGLE_LOGIN.md` promete validación backend previa; `signIn` solo almacena/decodifica y Login navega. Es contradicción de seguridad/documentación; explotación de API no demostrada. |
| INT-003 | Parcialmente confirmado | High → Medium | `sub` existe en sesión, pero `USR-001` gobierna perfil/publicaciones. La incoherencia es real; la vulnerabilidad de objetos depende del servidor. |
| INT-004 | Parcialmente confirmado | Medium → Low | No se envían imágenes ni `usuarioId`; las imágenes se declaran preview. La afirmación documental sobre `usuarioId` es falsa, pero el API podría derivarlo del bearer. |
| INT-005 | Confirmado | Medium → Medium | Solo hay interfaces/mocks consumidores; no hay OpenAPI, generación ni validación runtime. |
| INT-006 | Confirmado | Medium → Low | `.env.example` backend incluye variables inertes y `/home`; el servidor solo lee `PORT`. Es deuda/configuración residual coherente con un backend reservado. |

### Totales de validación

| Clasificación | Cantidad |
|---|---:|
| Confirmado | 10 |
| Parcialmente confirmado | 7 |
| Condicionado | 2 |
| No confirmado | 0 |
| Refutado | 1 |
| Obsoleto | 0 |

## D. Revisión de seguridad e identidad

### Flujo real de Google

1. `index.html:6-10` carga `https://accounts.google.com/gsi/client`.
2. `GoogleAuthService.renderButton` espera el global, inicializa con `googleClientId`, FedCM y callback.
3. GIS entrega `response.credential`; por documentación interna se pretende un ID token, no se solicita un access token ni scopes OAuth en el código.
4. `Login.signInWithGoogle` llama `GoogleAuthService.signIn`.
5. `signIn` guarda primero la cadena en `sessionStorage` y extrae claims.
6. `AuthTokenService` comprueba tres segmentos, JSON decodificable y `exp` futuro. No comprueba `alg`, firma, `iss`, `aud`, `azp`, `email_verified` ni nonce.
7. Se exige `sub` y `email` para crear identidad de presentación.
8. El interceptor añade el mismo token como bearer a peticiones cuyo URL empieza por `apiBaseUrl`.
9. Un 401 limpia token y navega a login. Logout limpia signal/token y llama `disableAutoSelect`.

La prueba `google-auth.service.spec.ts:5-18` usa deliberadamente un JWT `alg:none` con firma ficticia y espera sesión válida. Queda demostrado un **bypass de autenticación del cliente**, no una vulnerabilidad de autorización de datos. Perfil y publicaciones propias ni siquiera usan `sub`; usan `USR-001`. Sin políticas `validate-jwt` ni origen API no puede certificarse aceptación/rechazo server-side.

### APIM

El frontend construye `${apiBaseUrl}${endpoint}` y envía `Ocp-Apim-Subscription-Key`; añade bearer si `getToken()` devuelve valor. El entorno local tiene configuradas las tres propiedades (solo se comprobaron presencia/no vacío, sin revelar valores). No existen políticas APIM, OpenAPI, infraestructura ni implementación origen en el repositorio. Por tanto:

- no puede certificarse firma/audiencia/issuer;
- no puede certificarse autorización por propietario;
- no puede determinarse si la subscription key es solo identificación/cuota o un secreto privilegiado;
- no se realizaron llamadas remotas.

### `USR-001`

Solo aparece en código productivo de `Profile` y `MyPublications`. Se usa como parámetro en `GET /usuarios/{id}`, `PUT /usuarios/{id}` y `GET /usuarios/{id}/publicaciones`. No aparece en mensajería, alta de publicación ni interceptor. No se sustituye por `GoogleAuthService.user().id`. No hay evidencia local de que el servidor compare ese ID con el bearer.

## E. Revisión arquitectónica

### Frontend y APIM

La arquitectura actual es una SPA Angular que consume mocks/servicios externos vía APIM. Esta conclusión está soportada tanto por código como por README y workflow. Los servicios feature, cliente HTTP e interceptor son la frontera local; el contrato del proveedor no está versionado.

### Papel de Express

- **Hipótesis A, backend incompleto que debería implementar negocio:** débil; no hay requisitos, rutas, modelos ni referencia desde la SPA.
- **Hipótesis B, residual/auxiliar y API fuera del repositorio:** fuertemente respaldada por README:15,233,291, `api_location: ""` en CI y `environment.apiBaseUrl`.
- **Hipótesis C, transición incompleta:** posible porque Express fue inicializado y conserva variables de API, pero no hay ADR/roadmap que confirme transición.
- **Hipótesis D, futuro no determinado:** confirmada respecto de su papel futuro, aunque su papel actual de servidor mínimo no integrado sí está claro.

Conclusión: actualmente es un placeholder/auxiliar no desplegado; no debe exigírsele cubrir contratos sin una decisión del equipo.

## F. Revisión de contratos

Todos los endpoints incluyen subscription key según el cliente y bearer solo cuando hay token válido localmente. “Autenticación requerida” es intención del cliente, no prueba de enforcement externo.

| Método/ruta | Solicitud / respuesta esperada | Nivel de comprobación |
|---|---|---|
| `GET /publicaciones?page&pageSize` | query numérica → `PaginatedResponse<Publication>` | Verificado en consumidor y unit tests; externo no disponible |
| `GET /publicaciones/{id}` | id string → `PublicationDetail` | Inferido del consumidor y mocks |
| `POST /publicaciones` | `CreatePublication` → cuerpo ignorado | Inferido; sin `usuarioId` ni imágenes |
| `GET /usuarios/{id}/publicaciones` | id → `PaginatedResponse<UserPublication>` | Inferido; sin query de página |
| `GET /usuarios/{id}` | id → `User` | Inferido del consumidor y mocks |
| `PUT /usuarios/{id}` | `UpdateUser` → `UpdateUserResponse` | Inferido del consumidor y mocks |
| `GET /chats` | sin query → `PaginatedResponse<Chat>` | Inferido; metadatos descartados |
| `POST /chats/{id}/mensajes` | `{texto}` → cuerpo ignorado | Inferido del consumidor y mocks |

Ninguno está verificado por implementación local o contrato versionado. Los tests comprueban construcción y comportamiento del cliente, no compatibilidad con APIM.

## G. Evaluación documental

`AGENTS.md`, las reglas de mantenimiento y el índice forman una entrada útil y no excesiva. Arquitectura, mapa y contratos representan bien el código. Las auditorías iniciales son trazables y separan incertidumbre, pero requirieron estos ajustes:

- reducir el carácter problemático del backend a la luz de la Fase I explícita;
- refutar BE-004 y retirar esa deuda del estado actual;
- matizar seguridad cliente frente a autorización externa;
- reconocer que las imágenes se presentan explícitamente como preview;
- actualizar pruebas y runtimes realmente ejecutados.

Persisten incertidumbres inevitables sobre APIM, origen, datos, despliegue backend futuro y contrato autoritativo.

## H. Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `git status`, `rev-parse`, historial por rutas | Mismo commit; sin cambios de código desde la primera auditoría |
| Backend `npm run build` | Exitoso |
| `node --import tsx src/server.js` | Resolvió TypeScript y mostró arranque; refuta ruta inexistente |
| Smoke HTTP backend | No verificable: el sandbox no mantuvo/permitió socket accesible |
| Frontend con Node 24.21.0: `ng test --watch=false` | **18 archivos, 170 tests, todos exitosos** |
| Angular `ngc -p tsconfig.app.json --noEmit` | Exitoso |
| Angular build a `/tmp` | Producción abortó con exit 134; reintentos con un worker y configuración development también abortaron. No validado |
| `npm audit --offline --omit=dev` | 0 advisories en caché para ambos proyectos; no equivale a auditoría en línea actualizada |
| Inventario/enlaces Markdown | Se valida nuevamente al cierre |

## I. Hallazgos adicionales

### SPV-001 — Consumidores paginados sin navegación funcional

- **Severidad:** Medium.
- **Categoría:** Funcionalidad / integración.
- **Evidencia:** `getUserPublications` no acepta page/pageSize (`publication.service.ts:34-39`); botones de `my-publications.html:353-375` no tienen handlers. `getChats` tampoco envía página y `Messenger` solo usa `response.items`, descartando metadatos (`messenger.ts:196-245`).
- **Impacto:** registros posteriores a la página predeterminada pueden ser inaccesibles; en “mis publicaciones” el botón Siguiente puede aparecer habilitado sin hacer nada.
- **Recomendación:** definir semántica del API y conectar navegación/query o declarar respuestas no paginadas.
- **Validación:** test con `totalRecords > pageSize` que exija acceder a página 2.

### SPV-002 — Un filtro sin coincidencias oculta la navegación a páginas posteriores

- **Severidad:** Medium.
- **Categoría:** Estado / UX funcional.
- **Evidencia:** `Home` filtra solo `allPublications` de la página (`home.ts:39-49`); el footer de paginación está dentro de `@if (publications().length > 0)` (`home.html:225-292`).
- **Impacto:** si la página actual no coincide, se muestra estado vacío y desaparece Siguiente aunque otras páginas puedan contener coincidencias.
- **Recomendación:** filtros server-side o mantener navegación/explicar alcance cuando el total remoto aún tenga páginas.
- **Validación:** página 1 sin coincidencia y página 2 con coincidencia.

### SPV-003 — Límite de credenciales determinado por prefijo textual

- **Severidad:** Low, condicionado.
- **Categoría:** Seguridad de cliente.
- **Evidencia:** `api-key.interceptor.ts:9` usa `req.url.startsWith(environment.apiBaseUrl)`.
- **Impacto:** una futura llamada HttpClient a un URL de origen parecido (`baseUrl.ejemplo`) recibiría subscription key/bearer; si `apiBaseUrl` estuviera vacío, coincidiría con todo. No existe hoy una llamada dinámica explotable y el entorno local está configurado.
- **Recomendación:** parsear `URL`, comparar origen y prefijo de ruta normalizado, y rechazar configuración vacía al iniciar.
- **Validación:** tests negativos con origen parecido, URL externa y base vacía.

### SPV-004 — Expiración de sesión solo perezosa y signal de usuario no sincronizado

- **Severidad:** Low.
- **Categoría:** Estado de autenticación.
- **Evidencia:** la expiración se comprueba solo al invocar `getToken` (`auth-token.service.ts:19-27,40-46`); no hay temporizador y limpiar allí no actualiza `GoogleAuthService.user`.
- **Impacto:** una vista abierta puede seguir mostrando identidad/shell tras expirar hasta navegar o solicitar; la autorización real sigue dependiendo del servidor.
- **Recomendación:** una fuente única de sesión que propague expiración y cierre de UI, manteniendo enforcement server-side.
- **Validación:** reloj falso que expire durante una ruta abierta y compruebe token, signal, navegación y siguiente petición.

## J. Recomendaciones priorizadas

1. **Evidencia externa antes de afirmar seguridad:** obtener políticas APIM y contrato/origen; revisar `validate-jwt`, audiencia, issuer, ownership y alcance de clave.
2. **Corregir defectos locales funcionales:** conectar `USR-001` con una identidad definida, paginar publicaciones/chats y evitar el callejón sin salida de filtros.
3. **Alinear autenticación y documentación:** decidir si habrá intercambio backend o bearer directo; corregir `GOOGLE_LOGIN.md` y pruebas nominales.
4. **Versionar contratos:** OpenAPI/esquemas, error envelope y contract tests sin depender de producción.
5. **Recuperar build reproducible:** investigar exit 134 de esbuild; fijar versión exacta de Node/npm y ejecutar CI limpio.
6. **Accesibilidad y endurecimiento:** modal de perfil, comparación de URL y sincronización de expiración.

## K. Preguntas arquitectónicas pendientes

1. ¿APIM valida firma, `aud`, `iss` y expiración del ID token en todas las operaciones?
2. ¿El servicio origen autoriza propiedad ignorando/validando `{id}`?
3. ¿`USR-001` es un identificador contractual del mock de Fase I o deuda accidental?
4. ¿Quién deriva el usuario al crear una publicación: bearer, body o política APIM?
5. ¿La subscription key es pública/restringida por cuota o concede acceso sensible?
6. ¿Filtros/estadísticas deben abarcar catálogo completo o página actual?
7. ¿Express seguirá como placeholder, será BFF/API o debe retirarse?
8. ¿Cuál es el contrato autoritativo y el calendario para sustituir mocks?

## L. Conclusión

El repositorio está preparado para iniciar correcciones locales de alcance claro —paginación, estado, ejemplo de entorno, accesibilidad y documentación— porque typecheck y 170 pruebas pasan. No está preparado para certificar ni rediseñar autorización: faltan políticas APIM, implementación origen y contrato autoritativo. Antes de cambios de seguridad o backend se requiere resolver las preguntas de la sección K. El build de producción también debe reproducirse exitosamente antes de considerar lista una entrega.
