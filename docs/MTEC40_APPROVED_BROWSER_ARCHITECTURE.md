# MTEC-40 — Arquitectura de navegador aprobada y criterios HTTP

**Estado:** arquitectura objetivo aprobada por el responsable; parámetros de transporte propuestos; implementación y despliegue no verificados. **Destinatarios:** responsables de Angular, ms-users, ms-catalog, ms-notifications, APIM, infraestructura y seguridad. **Alcance:** navegador, entrada pública, sesiones y frontera de confianza para MTEC-40/MTEC-15/MTEC-12. MTEC-41 continúa abierto.

## Autoridad, evidencia y límites

**Decisión aprobada:** Angular se aloja en Azure Static Web Apps y consume una entrada pública Azure API Management (APIM). Ambos usan orígenes HTTPS diferentes bajo un mismo *site* (mismo esquema y dominio registrable); los tres microservicios independientes quedan detrás de APIM, cada uno con persistencia y autorización propias. ms-users verifica Google y emite JWT internos; APIM valida JWT de acceso en rutas protegidas; los backends revalidan defensivamente y autorizan recursos. El acceso público directo a backends no puede eludir los controles de entrada. Esta decisión complementa [ADR-004](../context/decisions/ADR-004-seguridad-autenticacion.md) y [ADR-001](../context/decisions/ADR-001-distribucion-microservicios.md); no declara aprobados los parámetros B07 aún Draft.

**Método y evidencia verificada:** lectura estática de [contrato de identidad](../contracts/identity/IDENTITY_CONTRACT.md), [Users OpenAPI](../contracts/openapi/users.json), [Catalog OpenAPI](../contracts/openapi/catalog.json), [Notifications OpenAPI](../contracts/openapi/notifications.json), [revisión de release](MTEC15_AUTH_CONTRACT_RELEASE_REVIEW.md) y [B07 local](MTEC15_B07_LOCAL_INTEROPERABILITY_REVIEW.md) sobre `05d84bede908cb14484f99a66bd1ea131bd8c0d1`. El código Angular aún conserva Google credential/`sub` como sesión/usuario y un token en `sessionStorage`; las fundaciones locales de servicios solo prueban health. **Documentado pero no verificado:** el backend interno Google G2B-D y sus resultados comunicados, así como las 40 pruebas contractuales previas. **No determinado:** dominio, DNS, certificados, SKU/capacidades APIM, políticas efectivas, aislamiento de red y comportamiento real de cookies/navegadores. No se inspeccionó Azure ni el repositorio independiente ms-users en esta revisión. Los nombres de host ilustrativos no son destinos configurados.

```text
Navegador: Angular / Azure Static Web Apps (origen HTTPS A)
              │  JWT interno en Authorization; cookie solo en operaciones de sesión
              ▼
          Azure API Management (origen HTTPS B, mismo site que A)
              ├── ms-users          → identidad, sesiones y persistencia propia
              ├── ms-catalog        → publicaciones, conversaciones y persistencia propia
              └── ms-notifications  → notificaciones y persistencia propia
```

APIM es la única entrada de API prevista para el navegador. Los servicios no comparten base de datos ni clave privada de firma. El JWT original puede llegar al servicio destinatario; un header de identidad enviado por el navegador nunca constituye principal confiable.

## Responsabilidades y seguridad

| Componente | Obligación | Evidencia / límite |
|---|---|---|
| Angular | Iniciar intentos de propósito explícito, recibir sesión según contrato, conservar access JWT y CSRF solo en memoria, usar cookies solo en rutas necesarias y presentar estados UX. | **Verificado:** cliente actual requiere migración. No decide autorización definitiva ni guarda access/refresh en `localStorage` o `sessionStorage`. |
| ms-users | Verificar ID Token Google, issuer/audience/nonce e intento; resolver o crear `userId`; emitir JWT interno; mantener refresh rotatorio, deadlines, revocación, CSRF y logout. | HTTP y controles de sesión **no verificados**. No delegar identidad interna al token Google. |
| APIM | Enrutar por método/ruta, validar JWT interno en protegidas, CORS/preflight, cuotas, saneamiento y políticas de entrada; preservar respuestas de cookie/CSRF. | Políticas reales **no determinadas**. Subscription key sirve para admisión/cuota, nunca para autenticar usuario; no introducir secreto APIM en Angular. |
| ms-catalog | Revalidar JWT/principal y autorizar publicaciones, conversaciones y recursos por propietario o participante. | Rutas de negocio y validador no acreditados por la fundación local. |
| ms-notifications | Revalidar acceso, aislar consultas/entregas por `userId` destinatario y validar procedencia de eventos. | GET Draft no acredita controles efectivos; transporte SSE pendiente. |
| Infraestructura | Restringir acceso directo a backends a rutas confiables de APIM y administración autorizada; verificar identidad de origen, TLS y observabilidad sin secretos. | Mecanismo concreto de red/identidad y pruebas de bypass **pendientes**. Una URL de backend expuesta sin igual control invalida la frontera. |

En rutas protegidas, APIM y backend deben verificar firma RS256 con clave pública confiable, `iss`, `aud`, `sub=userId` opaco, `sid`, `iat`, `exp`, `jti` y `kid` JOSE según el [perfil aprobado y partes Draft](../contracts/identity/IDENTITY_CONTRACT.md#6-jwt-jwks-y-metadata-perfil-aprobado-interfaz-draft). RSA-2048, TTL nominal máximo 240 s y cero leeway positivo para `exp` están aprobados; valores `iss/aud`, márgenes medidos, caché/frescura, rotación y residual ordinario ≤300 s requieren prueba. Rechazar Google JWT, `none`/HMAC, claves indicadas por el token y headers cliente como identidad. JWKS público y aprovisionamiento controlado de claves públicas deben evitar ciclos de arranque; la metadata propia no equivale a discovery OIDC. APIM no sustituye ownership, participación ni revocación autoritativa en ms-users.

## Flujos de navegador y sesión

| Flujo | Secuencia requerida / estado |
|---|---|
| Login Google | Angular pide `POST /v1/auth/attempts` con `purpose=login` (o ausencia según Draft); ms-users fija nonce e intento de un uso. Angular obtiene ID Token GIS y llama `POST /v1/auth/google` con `credential,attemptId`, cookie de intento, CSRF y Origin permitido. ms-users verifica token/nonce/intento/navegador y vínculo exacto ACTIVE a cuenta autorizada; no crea cuenta. Devuelve `AuthResponse`, access interno, CSRF de sesión y cookie refresh. Operación HTTP **Draft**. |
| Registro Google | Intento `purpose=register`, exclusivo de Google, seguido de `POST /v1/auth/google/registrations`; ms-users exige propósito exacto y crea atómicamente `userId` nuevo, cuenta básica y vínculo ACTIVE solo si no existe vínculo exacto de ningún estado. PENDING se rechaza sin activarlo. Coincidencia de correo no fusiona, transfiere historial ni concede privilegios TEC. Respuesta de sesión como login; operación HTTP **Draft**. |
| Refresh / restauración | `GET /v1/auth/session` lee estado sin renovar ni emitir access; `POST /v1/auth/refresh` con cookie+CSRF rota refresh opaco y emite access solo si la sesión sigue vigente. Angular serializa refresh entre pestañas, maneja carreras/pérdida sin gracia general ni guardar tokens en storage. El protocolo concreto de coordinación/reconciliación sigue pendiente de conformidad y pruebas. |
| Logout | `POST /v1/auth/logout` con Origin y CSRF cuando hay cookie; `scope=current` revoca familia y borra cookie con nombre/Path/ámbito coincidentes. `scope=all` exige sesión/prueba reciente según Draft. La respuesta 204 no prueba corte inmediato de JWT ya emitidos; residual distribuido sigue pendiente. |

La sesión se rige por 60 minutos de ventana renovable, 30 minutos de inactividad elegible respaldada por servidor y 8 horas absolutas desde login inicial; vence al primer límite, incluso en igualdad. Refresh automático y polling no constituyen actividad. El servidor decide vigencia y revocación; el JWT no amplía deadlines. La recuperación tras recarga requiere cookie válida y restauración controlada, no persistencia del access en JavaScript.

## Cookies, CSRF y CORS: parámetros propuestos

**Propuesta de cookie:** `__Host-mtec-attempt` (≤300 s y vinculada a intento) y `__Host-mtec-refresh` (opaca y rotatoria), `HttpOnly; Secure; Path=/; SameSite=Lax`, sin `Domain`, host-only del origen APIM. `SameSite=Lax` solo es viable si A y B son realmente same-site HTTPS. El prefijo `__Host-` exige `Path=/`, `Secure` y ausencia de `Domain`: un Path restringido requeriría otro nombre y revisión del contrato/borrado. La cookie de refresh está acotada por revocación y primer deadline 60/30/8 en servidor; su Max-Age no concede vigencia. APIM debe preservar cada `Set-Cookie` y no reenviar refresh a servicios de negocio. No se ha comprobado que APIM acepte/preserve este transporte.

**CSRF propuesto:** token sincronizador del intento o sesión, entregado en respuesta `no-store`, ligado por servidor al contexto y enviado en `X-CSRF-Token`; Angular lo conserva solo en memoria. La creación inicial de intento, sin cookie previa, exige Origin exacto, JSON, `X-MTEC-Client: web` y tasa; la continuación de login/registro exige cookie de intento y CSRF. Refresh/logout exigen cookie+CSRF si hay sesión; logout current sin cookie es no-op solo tras controles de Origin/forma. Métodos con JWT+cookie exigen coincidencia de `sid/userId`. SameSite=Lax no sustituye CSRF. Mutaciones web sin Origin se rechazan en la política propuesta; GET sin Origin puede aceptarse únicamente si es seguro, no tiene efectos y cumple su propia autenticación. Clientes no web requieren política y canal separados antes de eximirlos. `Origin`, `X-MTEC-Client` y CORS no autentican usuarios.

| Clase de ruta (borrador) | Métodos de negocio | Credencial y CORS propuestos | Estado |
|---|---|---|---|
| `/v1/auth/attempts`, `/v1/auth/google`, `/v1/auth/google/registrations`, `/v1/auth/email/requests`, `/v1/auth/email/confirm` | POST | Origen Angular exacto, credenciales para cookie de intento y controles por operación; sin bearer previo. | Rutas y reglas Draft; correo conserva dependencias propias. |
| `/v1/auth/session`, `/v1/auth/refresh`, `/v1/auth/logout` | GET; POST; POST | Cookie de sesión, CSRF/Origin cuando corresponda; sin bearer vigente obligatorio. | Draft HTTP. |
| `/v1/auth/session/activity`, `/v1/auth/proofs/*`, `POST /v1/me/auth-methods` | POST según OpenAPI | JWT+cookie+CSRF y principal coincidente; no excepción global `/auth/*`. | Protocolos B03/B04 pendientes. |
| `/v1/usuarios/{userId}`, `/v1/me/profile`, `GET /v1/me/auth-methods`; Catalog/Notifications GET Draft y futuras mutaciones | GET/PUT y métodos exactos que apruebe cada contrato | Bearer interno; cookie innecesaria; APIM y backend revalidan. | Escrituras/chats de Catalog aún sin contrato completo. |
| `/.well-known/jwks.json`, `/.well-known/markettec-identity` | GET | Público sin bearer, cookie ni key; caché/tasa acotadas. | Publicación/alcance reales pendientes. |

**Orígenes y preflight propuestos:** allowlist de origen HTTPS exacto de Angular por entorno, más desarrollo enumerado y separado; hosts concretos **pendientes de inventario**. Para cada ruta, permitir solo método real y headers necesarios: `Content-Type`, `Authorization`, `X-CSRF-Token`, `X-MTEC-Client`, `X-Correlation-ID` según operación. `Ocp-Apim-Subscription-Key` solo durante compatibilidad heredada, nunca como clave confidencial de SPA. OPTIONS preflight valida Origin, método y headers, no pide bearer/cookie/key ni ejecuta negocio. Responder `Access-Control-Allow-Origin` con el origen exacto permitido y `Vary: Origin`; `Access-Control-Allow-Credentials: true` solo donde se requieren cookies, nunca `*` con credenciales. Exponer `X-CSRF-Token`, `X-Correlation-ID`, `Retry-After` cuando corresponda; `Set-Cookie` se procesa por el navegador, no se expone a JavaScript. Angular usa `credentials: 'include'` únicamente para operaciones que requieren cookie; no adjunta cookie deliberadamente a Catalog/Notifications. APIM debe filtrar headers de identidad suministrados por cliente, limitar tamaños/tasa y redactar secretos. Probar CORS tanto en preflight como respuesta real y error.

## Dependencias, alternativas y verificaciones

**P0, infraestructura:** asignar hosts reales y demostrar mismo site HTTPS; DNS, certificados, SWA/APIM, cookie y CORS en navegadores objetivo; política APIM por método/ruta, alcance de backend, bypass directo y preservación de Set-Cookie. Configurar y comprobar issuer/audience, claves públicas, relojes, rotación/caché y residual distribuido. Sin esa evidencia no se declara interoperabilidad B07 ni despliegue. Si la topología aprobada resulta inviable, elevar una nueva decisión formal; cookies cross-site (`SameSite=None`) y proxy SWA quedan diferidos, no se adoptan aquí.

**P1, consumidores:** Angular, ms-users, APIM, ms-catalog, ms-notifications y seguridad deben registrar conformidad por versión/diff y resultados; verificar login/registro separados, 401/403/503, recarga, carreras, revocación y ownership. Las subscription keys heredadas aparecen en OpenAPI y en build/interceptor Angular; su remoción como dependencia de un supuesto secreto SPA requiere revisión contractual y de políticas dentro de MTEC-41, que permanece abierto. No se ha ejecutado esa remediación.

**Trabajo local HTTP permitido:** diseñar adaptadores y DTOs en ms-users contra el Draft, mocks de cookies/Origin/CSRF/APIM, pruebas de validación Google/nonce/propósito, PENDING y carreras, emisión y deadlines 60/30/8, refresh/logout/errores, sin publicar endpoints ni asumir hosts. **Integración interoperable:** exige topología y parámetros efectivos, conformidad Angular/ms-users/APIM, prueba de navegador real y validación JWT/APIM/backend; Catalog/Notifications requieren sus propias conformidades. La [revisión B07](MTEC15_B07_LOCAL_INTEROPERABILITY_REVIEW.md) conserva la matriz de consumidores y bloqueos.

**Notificaciones:** transporte SSE sigue sin decisión. No se conoce capacidad del plan APIM actual para streaming persistente; comprobarla antes de diseñar admisión, reconexión, corte por vencimiento/revocación y aislamiento. Polling autenticado con GET Draft es alternativa inicial si SSE no es viable. El contrato de eventos [`message.sent`](../contracts/events/message-sent.v1.schema.json) permanece vigente y no cambia por elegir transporte.
