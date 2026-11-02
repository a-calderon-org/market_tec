# MTEC-15 — Revisión de propuesta contractual de autenticación

**Fecha:** 2026-11-02

**Alcance de resultados:** evidencia histórica de subfase 1. Las correcciones y
verificaciones posteriores se registran en el [QA independiente de subfase 2](MTEC15_AUTH_QA_REVIEW.md);
los conteos y el estado Git siguientes corresponden al cierre original.

**Estado de las interfaces:** Proposed / draft-pending-team-approval, 0.2.0-draft.

**Dictamen:** **PARTIAL — BLOCKED** para aprobación e integración. La propuesta
contractual y su validación local están preparadas para QA independiente; no se
demuestran todavía los controles operativos necesarios para satisfacer todos los
requisitos de seguridad. No es un fallo de sintaxis ni aprobación de seguridad.

**Destinatarios:** responsables de los tres microservicios, frontend,
APIM/infraestructura, seguridad y responsable del proyecto.

## 1. Alcance, método y límites

Revisión de diseño y compatibilidad sobre
`a-calderon-org/market_tec@4c087f847be73ea1be59f41cabee95c8ca94448b`.
Se leyeron íntegramente ADR-001, ADR-004, DECISION_LOG, contrato de identidad y
los tres OpenAPI, envelope/eventos, fixtures y validadores. Se contrastaron con
consumidores Angular, fundaciones backend, workflow ci-contracts y documentación
de integración. Se inventariaron rutas/esquemas/consumidores antes de editar OpenAPI.

Se consultaron Jira y PR #23 en modo lectura, sin modificar servicios, frontend,
repositorio independiente, tickets o Azure. Se instalaron las herramientas ya
fijadas del directorio contracts en el worktree aislado; no se actualizaron locks
ni dependencias. Las pruebas nuevas son contractuales, no un backend de autenticación.

Fuentes canónicas de interfaz: [identidad](../contracts/identity/IDENTITY_CONTRACT.md)
y [Users OpenAPI](../contracts/openapi/users.json). Este informe analiza evidencia,
compatibilidad, riesgos y decisiones pendientes; no establece un contrato paralelo.

| Evidencia | Certeza y resultado | Límite |
|---|---|---|
| [PR #23](https://github.com/a-calderon-org/market_tec/pull/23), fetch origin y HEAD | **Verificado:** fusionado, merge 4c087f8; coincide con origin/main usado para crear rama | El merge acepta solo núcleo ADR-004, no parámetros ni contratos |
| [ADR-001](../context/decisions/ADR-001-distribucion-microservicios.md), [ADR-004](../context/decisions/ADR-004-seguridad-autenticacion.md), [DECISION_LOG](../context/decisions/DECISION_LOG.md) | **Verificado:** base Accepted, responsabilidades y 60/30/8; parámetros Pxx pendientes | No acreditan eficacia desplegada |
| [MTEC-15](https://allanaron06122005.atlassian.net/browse/MTEC-15) | **Verificado:** In Progress, solicita propuesta de ambos métodos tras PR #23 y revisión conjunta | Sin aprobación automática por CI |
| [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) | **Verificado:** In Progress; pendientes JWT, protocolos, refresh/revocación, claves, CSRF/CORS, excepciones/origen y conformidades | Bloquea parámetros interoperables |
| [MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36) | **Verificado:** To Do; ambos métodos y sesiones, depende de acuerdos/contratos | No iniciado por este trabajo |
| [MTEC-10](https://allanaron06122005.atlassian.net/browse/MTEC-10) | **Verificado:** To Do; reemplazar USR-001 por identidad interna, no Google sub | Compatibilidad dinámica pendiente |
| [MTEC-12](https://allanaron06122005.atlassian.net/browse/MTEC-12) | **Verificado:** In Progress; exige auditar políticas reales y protección directa | Su sección histórica de alternativas no refleja aún el núcleo Accepted posterior; prevalece ADR-004/Jira actualizado de MTEC-40 |
| [GoogleAuthService](../app/frontend/src/app/features/auth/services/google-auth.service.ts), [AuthTokenService](../app/frontend/src/app/core/auth/auth-token.service.ts), [interceptor](../app/frontend/src/app/core/api/api-key.interceptor.ts) | **Verificado:** signIn guarda Google directamente sin HTTP; identidad visual deriva de sub; sessionStorage y expiración cliente; interceptor adjunta bearer/key y maneja 401 obsoleto | No demuestra aceptación o rechazo del backend remoto |
| [Perfil](../app/frontend/src/app/features/profile/profile.ts), [publicaciones propias](../app/frontend/src/app/features/publications/my-publications/my-publications.ts) | **Verificado:** usan USR-001; [UserService](../app/frontend/src/app/features/profile/services/user.service.ts) consume GET/PUT usuarios/{id} | No basta cambiar el valor por Google sub |
| [HealthController](../app/ms-users/src/main/java/com/markettec/users/adapters/in/web/HealthController.java) | **Verificado:** health, sin autenticación de negocio en scaffold | No es la implementación independiente de dominio |
| ms-users independiente, copia persistente ms-users-mtec37@7f963a98494a74acbe2479c91a372224ec55a033 | **Verificado por lectura local:** UserService, Email, ExternalIdentityKey, VerifiedExternalIdentity, AuthenticatedPrincipal, IdentityLinkAuthorization, HealthController y Flyway V1 | Conector GitHub devolvió 404; gh no está instalado. ls-remote confirma main@19ce9f18281c4d6a73985772824e60d4587bd80c, pero ese objeto no está en esta copia; no se hizo fetch ni se alteró ese repositorio |
| Árbol remoto independiente igual al 7f963a9 según QA anterior ADR-004 §7.1 | **Documentado pero no verificado** nuevamente en esta revisión | No atribuir inspección remota actual, CI nuevo, ni despliegue |
| Azure/APIM efectivos, entrega de correo, claves y navegadores | **No determinado** | No se operaron ni probaron sistemas remotos |

## 2. Inventario anterior y comparación

Base 0.1: cuatro operaciones, tres rutas; health implementado, Google y perfiles
solo propuestos. Diez esquemas: UserId, EpochSeconds, HealthResponse,
GoogleAuthRequest, AuthResponse, AuthenticatedUser, UserProfileV1, UpdateUserRequest,
UpdateUserResponseV1 y ErrorEnvelope.

| Operación anterior | Estado comprobado | Cambio 0.2 |
|---|---|---|
| GET /health | Implemented | Objeto contractual preservado |
| POST /v1/auth/google | Proposed; credential → token/tokenType/expiresAt/user | Intento/cookie/CSRF obligatorios; 202 para buzón adicional; sesión/CSRF y errores ampliados |
| GET /v1/usuarios/{userId} | Proposed; Angular consume mapping /usuarios/{id} | DTO preservado; exige propietario, 401/403 y errores completos |
| PUT /v1/usuarios/{userId} | Proposed; Angular consume mapping /usuarios/{id} | DTOs y campos preservados; errores/amplitud de controles explícitos |

La ampliación produce **21 operaciones: una implementada y 20 propuestas**.
Son **17 operaciones añadidas**: intento de login, solicitud/confirmación email,
estado/refresh/logout/actividad, cuatro operaciones de pruebas protegidas,
GET/PUT perfil propio, GET/POST métodos propios y dos GET públicos de claves/metadata.
La matriz exacta método/ruta está en OpenAPI y en el contrato de identidad, con
seguridad, headers/body/respuestas, códigos, replay, idempotencia, confidencialidad,
correlación, integración Angular y responsabilidad APIM.

### Compatibilidad

| Clase | Resultado y evidencia |
|---|---|
| Conservado | Sin cambios en DTOs de perfil, fechas string, IDs string, campos permitidos de actualización, health, ErrorEnvelope y AuthenticatedUser; hashes semánticos contra base en fixture de regresión |
| Aditivo en inventario | Nuevas rutas, esquemas y respuestas de error; acceso email y sesiones comunes. Ser aditivo en rutas no prueba compatibilidad de un flujo de autenticación |
| Incompatible explícito | GoogleAuthRequest deja de aceptar credential solo; necesita attemptId/contexto/CSRF; consumidor 0.1 cerrado rechaza nueva AuthResponse con session/csrfToken; GET perfil se restringe a propietario |
| Versionado | info.version=0.2.0-draft, x-design-review.previousVersion y breakingChanges; no retirar rutas previas ni servir cambio silencioso sobre un eventual servidor 0.1. Acordar corte de consumidores o nueva versión HTTP antes de implementar |
| Perfil propio sin colisión | /v1/me/profile evita introducir literal me bajo usuarios/{userId}; un ID opaco válido puede ser “me” y no debe reservarse por accidente |
| Contratos ajenos | catalog.json, notifications.json, eventos y fixtures previos permanecen idénticos por bytes; no se declaran cubiertos todos sus endpoints futuros |
| Compatibilidad dinámica | **No determinada:** no existen adaptadores auth de esta propuesta para probar Angular/backend/APIM juntos |

El hash de regresión se ancla al commit base y protege los contratos revisados,
no constituye un mecanismo criptográfico de seguridad del producto.

## 3. Riesgo de sesión y alternativas no seleccionadas

**Verificado a nivel de diseño:** firma válida y exp no observan una revocación
posterior. Logout, sid, jti, versión y borrado de cookie no invalidan por sí solos
los bearer existentes. Skew y desfase entre relojes pueden ampliar aceptación.

**Inferido:** emitir exp ≤ mínimo de deadlines conocidos es necesario y puede
demostrar los límites temporales fijos si las mediciones de actividad son correctas,
sus cambios solo extienden plazos válidos y los validadores no añaden tolerancia que
los sobrepase. No demuestra corte por revocación/baja posterior. Sigue pendiente
reconocer actividad y fijar garantías de reloj/consistencia, por lo que no se presenta
como solución ya aprobada o probada.

| Alternativa | Seguridad y aceptación residual | Complejidad | Latencia | Disponibilidad | Consistencia APIM/backend | Efecto sobre ADR-004 |
|---|---|---|---|---|---|---|
| A. JWT breve, exp acotado a los tres deadlines vigentes al emitir | Acota límites ya conocidos; logout/baja conserva vigencia restante + skew/desfase. 900s es candidato, no acuerdo. Compromiso de clave no queda acotado al TTL mientras la clave siga confiable | Baja/media; cálculo y verificación temporal homogéneos, reloj y renovación | Validación local, sin llamada de estado por request | Buena mientras hay claves válidas en caché; nuevos tokens dependen del emisor | Todos deben aplicar perfil/deadline y márgenes compatibles. Un validador con leeway puede incumplir el límite | Mantiene fronteras; requiere cerrar P10/P11/P15. No aprueba residual ni satisface revocación inmediata |
| B. Revocaciones/versiones difundidas a proyecciones locales de cada validador | Reduce residual al retraso de difusión/caché. Push asíncrono no garantiza corte instantáneo; estado atrasado exige fail-closed o residual aprobado. Eventos deben autenticarse y resistir pérdida/reorden/replay | Alta: protocolo, snapshots/versiones, recuperación, retención y observabilidad. No leer DB de ms-users | Lookup local/caché, sin llamada a ms-users por autorización | Buena con proyección vigente; partición obliga bloquear para preservar garantía estricta | Mismo sid/versión/estado/criterio de frescura en gateway y todos los backends, incluidos hosts alternativos | Puede respetar fronteras con proyecciones independientes, pero requiere diseño/contrato y aprobación P15/P19; no se aprueba broker/almacenamiento nuevo |
| C. Estado vigente en gateway mediante autoridad/proyección de sesión | Puede cortar admisión al confirmar estado actual; caché introduce residual. Sin acceso directo y con fail-closed; definir qué ocurre con solicitudes ya admitidas. Introspección síncrona a ms-users por cada request añade acoplamiento rechazado en el alcance | Media/alta: disponibilidad del estado, control de origen, errores y protección de bypass | Lookup local/remoto por admisión; peor si consulta emisor | Gateway/estado se vuelven dependencia crítica; caída rechaza rutas protegidas si garantía estricta | Backends revalidan JWT; solo gateway puede controlar estado si origen está autenticado/aislado y esa frontera adicional se aprueba. Si se exige mismo estado defensivo, necesitan también proyección | Centralizar garantía de sesión o consultar emisor por request requiere revisión formal de frontera/ADR, no excepción implícita. Nunca base compartida |
| D. Atestación de sesión de vida muy breve firmada por emisor, validada localmente junto al acceso | Permiso acotado por deadline/lease; revocación residual hasta vencimiento de atestación más márgenes. No resuelve por sí sola actividad ni corte instantáneo | Alta para beneficio frente a A: segunda credencial, binding a sid/usuario/audiencia, caché y rotación | Validación local extra y obtención periódica, más tráfico | Dependencia de renovación más frecuente; fallo obliga expirar/bloquear | Todos deben verificar atestación y mismo perfil; no aceptar JWT solo ni mezclar sesiones | Requiere revisión P10/P15/P19 y nueva interfaz; ms-users conservaría firma. Firmar desde gateway cambiaría autoridad y queda fuera sin aprobación |

No se selecciona ninguna. Para aceptación estricta deben fijarse: instante de corte
(admisión o finalización de operación), solicitudes en vuelo, relojes/márgenes,
consistencia, política ante partición y confirmación de logout/revocación. Con
difusión eventualmente consistente no se puede prometer aceptación residual cero
sin una barrera/autoridad adicional o bloqueo cuando el estado no es demostrable.

Ejemplo candidato de ADR-004, **no aprobado**: TTL 900s + skew 30s permite aceptación
nominal hasta exp+30 según reloj validador, hasta 930s desde iat cuando exp-iat=900.
Desde logout queda solo vigencia restante más márgenes, pero no un SLA real sin
medir relojes. Acotar exp al deadline y después tolerar +30 también puede admitir
después de la sesión: debe eliminarse esa extensión o compensarla con margen
seguro demostrado. B01 bloquea declarar cumplimiento distribuido.

## 4. Hallazgos, bloqueos y preguntas de aprobación

| Bloqueo | Riesgo y decisión requerida | Responsables por rol / relación |
|---|---|---|
| B01 | Elegir y demostrar estrategia temporal/revocación coherente, residual permitido de logout/baja y tratamiento de in-flight/particiones/relojes. ¿Qué garantía exacta se exige y cómo la verifican todos los validadores? No hay residual aprobado después de sesión vencida | RP, SEG, ms-users, otros servicios y APIM; P10/P11/P15/P19 |
| B02 | Un enlace a buzón reasignado no acredita continuidad. ¿Qué prueba estable/procedimiento evita acceso histórico sin exigir matrícula/empleo para básico? Acordar namespace EmailIdentity, alta concurrente/conflictos y datos mínimos iniciales de nombre/perfil para email. Sin esos datos no emitir DTO completo inventado | Funcional, RP, ms-users y SEG; P05/P16/P18 |
| B03 | Señal JS no prueba humanidad. ¿Qué actividad reconoce servidor, con qué validación/deduplicación y coordinación? Activity propuesto permanece condicional, sin confiar en timestamps de navegador | ms-users, frontend, APIM, SEG; P10/P18/P23 |
| B04 | Nonce/iat reciente y callback silencioso no prueban interacción reciente. ¿Qué evidencia y reloj garantizan frescura de ambos métodos para link/all-logout? Cinco minutos sigue candidato | ms-users, frontend, funcional, SEG; P16/P18/P21 |
| B05 | Aprobar perfil JWT/alg/typ/claims/iss/aud/skew/kid y publicación/rotación/cachés. ¿Claves aprovisionadas en APIM o metadata conforme adicional? Metadata propia no se acepta como OIDC discovery. No inventar emisor OAuth para satisfacer una URL | ms-users, APIM, consumidores, SEG/RP; P02–P13; custodia productiva P14 posterior |
| B06 | Acordar nombres/ámbitos/SameSite, hosts y CORS/CSRF, esquema de desafío 401 cookie, aviso previo exacto, TTL/tasas y UX de dispositivos. ¿Se acepta reiniciar login en dispositivo distinto? ¿Topología permite cookies? Sin rebajar controles | frontend, ms-users, APIM/infra, SEG; P10/P18/P22/P23/P24 |
| B07 | Aprobaciones de interfaces/compatibilidad, versión canónica consumida y corte operativo del repo independiente. ¿Quién aprueba cada interfaz y con qué pruebas? No inferir conformidad por assignment, merge o lint | RP, tres servicios, frontend, APIM y seguridad; MTEC-15 y ADR-004 §7.1 |

Los roles no son firmas ni compromisos de fecha inventados. No se altera ADR-004,
DECISION_LOG ni Jira para cerrar estos puntos. MTEC-36 sigue To Do y no se inicia.

### Límites de ms-users independiente

En 7f963a9, `UserService.registerVerifiedIdentity` recibe evidencia ya verificada,
resuelve mapping existente y activa; no verifica por sí mismo Google/buzón.
`getOwnProfile`/`updateOwnProfile` exigen propietario; `IdentityLinkAuthorization`
requiere prueba autorizada y está denegada por defecto en composición. El principal
local expone solo userId(). Flyway V1 admite GOOGLE e INSTITUTIONAL_EMAIL con
unicidad efectiva issuer/subject, no unicidad de personas/correo. `Email` normaliza
solo dominio. La propuesta no cambia esos tipos, almacén o esquema: el futuro
adaptador debe mapearlos después de verificar, no bindearlos a DTO de navegador.

La extensión HTTP exige resolver sesiones, grants, EmailIdentity, alta/perfil inicial,
errores y canonicalización, sin una segunda implementación en app/ms-users. No se
revalidó build ni suite del repositorio independiente; su HEAD remoto completo queda
limitado por el acceso descrito en evidencia. No se atribuye éxito de Actions nuevo.

## 5. Consumidores e integración pendiente

| Consumidor | Cambios necesarios, sin realizarlos |
|---|---|
| Angular / MTEC-10 | Cambiar sesión Google por respuesta interna; nonce servidor en GIS; email solicitud/confirmación; withCredentials/CSRF según ruta, acceso en memoria, snapshot/aviso/continue, refresh serializado y logout servidor. Sustituir USR-001 por identidad interna; perfil por alias propio o ID interno. No usar sub Google |
| Interceptor Angular | Distinguir login/cookie/metadata/negocio; no bearer Google ni envío indiscriminado de credenciales. Un solo refresh, sin bucles; 401 de sesión terminal requiere login y 403 no renueva. Preservar protección frente a respuesta tardía sobre sesión nueva |
| ms-users / MTEC-36 | Consumir versión canónica aprobada tras B01–B07 pertinentes; ambos verificadores y sesión común, grants, replay/concurrencia, perfiles, claves. No implementar aquí; coordinar autoridad de repositorio antes de integración |
| APIM / MTEC-12 | Revisar matriz exacta del contrato, excepciones no wildcard, CORS/cookies/headers, envelope de errores gateway, perfil interno y origen backend autenticado. Metadata custom no es openid-config; no se supone configuración vigente |
| ms-catalog | Revalidar JWT/principal y aplicar propietario/participante; actor desde principal, sin lectura de usuarios por request. Borrador actual cubre solo GET listado/detalle y health: faltan escrituras, chats, mensajes y publicaciones propias consumidas por Angular; posteriores contratos/errores 401/403 requieren revisión/autorización separada |
| ms-notifications | Revalidar JWT interno, filtrar por principal y no por destinatario de query/body. Evento message.sent v1 ya incluye destinatario lógico; autenticar productor/transporte por identidad de servicio. Sin JWT de usuario dentro de eventos ni consulta DB ajena |

Los cambios requeridos de catalog/notifications se documentan aquí y **no se editan**
sus contratos. Ninguna subscription key acredita usuario, ningún header X-User-Id
sin prueba criptográfica/origen autenticado constituye un principal. No se introduce
una llamada obligatoria a ms-users en cada autorización.

## 6. Revisión crítica

1. **¿Ambos métodos sin duplicar usuario?** Sí como diseño: mismos AuthResponse,
   AuthenticatedUser, SessionSnapshot y principal; dos adaptadores resuelven mappings
   en ms-users. No se demuestra implementación ni deduplicación de personas por email.
2. **¿Recuperan mismo userId con seguridad?** Solo tras vínculo explícito de dos
   pruebas recientes suficientes. Coincidencia de correo no fusiona. B02/B04 bloquean
   prometer continuidad y vinculación seguras en ejecución.
3. **¿Correo reasignado?** Enlace prueba control nuevo, no titularidad antigua; detener
   acceso histórico con CONTINUITY_REQUIRED hasta política aprobada, sin exigir
   afiliación adicional para acceso básico. No reasignar ni crear cuenta conflictiva.
4. **¿Replay de enlaces?** Verificador seguro + propósito/intento/navegador + TTL y
   consumo transaccional único por POST; GET/HEAD no consume. Respuesta perdida pide
   intento nuevo. Todavía requiere pruebas del adaptador y almacén.
5. **¿Refresh concurrentes?** Candidato estricto: uno consume/rota; reuso detectado
   revoca familia incluido reemplazo ganador. Serializar pestañas; sin retry/gracia
   implícitos. Coste UX reconocido, política todavía no aprobada.
6. **¿60/30/8?** Vence primero, igualdad ya vencida; refresh automático no mueve
   ventana/actividad; continuación válida no reinicia absoluto; sesión vencida obliga
   nueva autenticación. Fixtures prueban aritmética, no enforcement remoto.
7. **¿Rechazo después de vencimiento/revocación?** exp acotado es candidato para
   deadlines conocidos, con márgenes adecuados; cambios posteriores requieren otra
   estrategia o residual explícito. B01 sin resolver: no hay garantía distribuida.
8. **¿Qué bloquea aprobar?** B01–B07, con decisiones de MTEC-40 y conformidades
   contractuales. Las cifras aceptadas no aprueban sus mecanismos.
9. **¿Qué admite trabajo local sin Azure?** Revisión y estos tests ahora; después de
   aprobación, adaptadores con reloj/fakes/almacén aislado, claves efímeras y buzón
   sumidero. No requiere envío real, recursos ni permisos Azure. No se inicia MTEC-36.
10. **¿Qué probar antes de Angular?** Interoperabilidad positiva/negativa de firma,
    iss/aud/alg/typ/kid/tiempos en Java/Node/Python; Google no autoritativo, nonces,
    correo reasignado y carreras de alta/confirmación/link; actividad/refresh/límites,
    pérdida de respuesta/reuso; propietario propio/ajeno; cookies/CSRF/CORS y dos
    pestañas/dispositivos; 401/403 sin bucles ni invalidaciones tardías; logs sin
    señuelos y caída/rotación. Luego APIM/origen y corte distribuido con autorización.

## 7. Validación reproducible y resultados

**Verificado:** Node 24.14.0, npm 11.9.0, Python 3.15.0; Redocly CLI **2.71.2** y
jsonschema **4.26.0**, con locks/requirements existentes. Python difiere del 3.12
del workflow: la ejecución local no acredita el run Linux/3.12 ni Actions remoto.

Desde el worktree:

```bash
npm ci --prefix contracts
python3 -m venv contracts/.venv
contracts/.venv/bin/python -m pip install -r contracts/requirements-validation.txt
npm --prefix contracts exec -- redocly lint contracts/openapi/users.json contracts/openapi/catalog.json contracts/openapi/notifications.json
contracts/.venv/bin/python -m unittest discover -s contracts/tests -p 'test_*.py' -v
git diff --check
```

| Verificación | Resultado | Límite |
|---|---|---|
| Suite base antes de editar | 12/12 PASS | Evidencia local |
| Suite final | 29/29 PASS: 12 existentes + 17 nuevas | Sin backend ni autorización real |
| Schema Draft 2020-12 | 33 componentes Users y esquemas de eventos válidos | No verifica criptografía ni desigualdades automáticamente |
| Fixtures auth | 32 casos de forma/semántica y 10 vectores temporales positivos/negativos | JWKS usa material placeholder no utilizable; no prueba RSA ni aleatoriedad |
| Ejemplos OpenAPI y referencias | Formas formales y referencias resolubles; IDs de operación únicos; operaciones necesarias presentes | No demuestra compatibilidad dinámica |
| Regresión ajena | Hashes de catalog/notifications/eventos/fixtures previos y DTOs conservados coinciden con base | No presume completitud de APIs futuras |
| Redocly tres OpenAPI | Cero errores, ocho warnings | Tres info-license y tres health sin 4xx ya presentes; dos no-unused-components nuevos para principal/claims internos usados por x-extensions y tests, no body HTTP |
| git diff --check | PASS al cierre | Incluye revisión de archivos nuevos mediante control de whitespace adicional |
| Actions remoto, pruebas de backend, navegador/Azure/APIM/correo real | No ejecutadas | Fuera de subfase; no declarar QA de seguridad PASS |

Se corrigieron las advertencias iniciales de ejemplos/condiciones, sin desactivar
reglas del linter ni relajar la validación formal. No se inventó licencia para
eliminar warnings de estilo. Los componentes de principal/claims permanecen sin
exposición HTTP deliberadamente. Workflow original descubre automáticamente el
nuevo test_auth_contracts.py; no requiere modificar CI.

## 8. Archivos, aislamiento y mantenimiento

| Elemento | Resultado |
|---|---|
| Repositorio / rama | a-calderon-org/market_tec; feat/mtec15-auth-contracts |
| Worktree persistente | /Users/allanaron06122005gmail.com/Developer/MarketTec/worktrees/market-tec-mtec15-auth-contracts |
| HEAD base y actual | 4c087f847be73ea1be59f41cabee95c8ca94448b; no commits nuevos |
| Archivos modificados | contracts/identity/IDENTITY_CONTRACT.md, contracts/openapi/users.json |
| Archivos agregados | contracts/tests/test_auth_contracts.py; contracts/examples/auth/{compatibility-baseline,schema-cases,session-policy-cases}.json; docs/MTEC15_AUTH_CONTRACT_REVIEW.md |
| Índice / estado | Sin staging; dos modificados y cinco archivos nuevos, locales sin confirmar |
| Copia principal OneDrive | main@de6192b preservado, mismos cuatro archivos modificados y dos no rastreados; solo origin actualizado por fetch autorizado |
| ADR / otros contratos / app / pipelines | Sin cambios |
| Commit, push, PR, merge | No |
| Azure / APIM / Jira / ms-users independiente modificados | No |

No se actualizaron documentos de context/: no cambió ningún hecho de implementación,
ningún parámetro Accepted ni el estado de los ADR; las referencias históricas a 0.1
conservan su fecha/base. Se corrigió la descripción desfasada de arquitectura no
aprobada en el contrato de identidad permitido. La matriz de UPDATE_PROTOCOL se
revisó: los desfases previos de integración (por ejemplo “no hay OpenAPI” en
FRONTEND_BACKEND), fase II/ejemplos y alcance antiguo de MTEC-12 quedan señalados;
su alineación operativa debe hacerse con sus dueños cuando se apruebe/implemente,
sin expandir esta subfase a documentos ajenos. El informe es auditoría técnica con
alcance, método, evidencia, límites, riesgos y acciones, sin notas conversacionales.

**MTEC-15 — Subfase 1: propuesta contractual preparada para QA independiente.
Las interfaces y parámetros de seguridad todavía requieren aprobación formal.**
