# Contrato compartido de identidad y autenticación

**Estado:** Proposed — pendiente de aprobación MTEC-15/MTEC-40
**Versión de diseño:** 0.3.0-draft (candidata; diferencias frente a 0.2 en §8)
**Destinatarios:** mantenedores de Angular, ms-users, ms-catalog, ms-notifications y APIM
**Base examinada:** `origin/main@c5dc74ffbe66d1d800972ad11402d8ac9becc3d9`, 2026-11-02

## 1. Autoridad y estado

[ADR-001](../../context/decisions/ADR-001-distribucion-microservicios.md) y
[ADR-004 §2.1](../../context/decisions/ADR-004-seguridad-autenticacion.md#21-arquitectura-base-aceptada-y-límites-de-aprobación)
y las [aprobaciones delimitadas de ADR-004 §3.4.1](../../context/decisions/ADR-004-seguridad-autenticacion.md#341-consolidación-de-aprobaciones-y-pendientes--2026-11-02)
son la autoridad de responsabilidades y perfil aceptado. Este documento
propone su interfaz compartida; no aprueba criptografía, almacenamiento, topología
ni controles de seguridad pendientes. [Users OpenAPI](../openapi/users.json)
especifica métodos, rutas, headers, cuerpos, esquemas, respuestas y errores. El
[informe de revisión](../../docs/MTEC15_AUTH_CONTRACT_REVIEW.md) contiene evidencia,
comparación histórica. La [revisión candidata B07](../../docs/MTEC15_AUTH_CONTRACT_RELEASE_REVIEW.md) recoge compatibilidad, QA y bloqueos vigentes, sin constituir otro contrato.

**Verificado en `ms-users/main@3f776f6`:** `GET /health` es la única operación
marcada `implemented` en este contrato. El servicio ya expone adaptadores parciales
de Google, sesión, refresh `mode=rotate` y logout `scope=current`; ninguna de esas
operaciones acredita todavía la interfaz completa candidata y conservan
`x-implementation-status: proposed`. También expone
`POST /v1/auth/google/registrations`, ausente de este OpenAPI: su interfaz requiere
conciliación antes de aprobación B07. El estado global es
`draft-pending-team-approval`. **No determinado:** configuración efectiva Azure/APIM.

### Núcleo aceptado y detalles propuestos

| Tema | Accepted según ADR-004 | Proposed / pendiente |
|---|---|---|
| Métodos | Google y enlace institucional simultáneamente desde v1 | Protocolos, TTL, tasas, pruebas y errores de las operaciones siguientes |
| Elegibilidad | Control verificado de correo de dominio exacto `estudiantec.cr`, `itcr.ac.cr` o `tec.ac.cr`; acceso básico sin prueba de matrícula/empleo | Canonicalización técnica, alta idempotente y continuidad de cuentas históricas |
| Identidad | `userId` interno opaco, estable, generado por ms-users; no fusión por email | Mapping contractual, namespace de EmailIdentity y prueba reciente de ambos métodos |
| Sesión | 60 min renovables, 30 min inactividad, 8 h absolutas; primer límite, servidor, aviso y reautenticación; sondeos no son actividad | B03 aprueba política de actividad; B06 transporte/serialización. Protocolos, aviso candidato y cumplimiento distribuido pendientes |
| Confianza | ms-users autentica/emite/publica claves; APIM admite; cada backend revalida y autoriza su dominio | RS256/RSA-2048 y JWKS aprobados; parámetros/propagación, protección de origen y reglas efectivas APIM pendientes |
| Comunicación | Identidad de servicio para trabajo interno y delegación explícita/acotada cuando actúa por usuario | Protocolo específico de workloads/delegación, fuera de esta propuesta HTTP |

El dominio nunca concede privilegios ni una categoría visible estudiante/funcionario.
No se introduce una obligación de matrícula o empleo para resolver continuidad.

## 2. Identidad, usuario y principal

`UserId` conserva string no vacío, máximo 64 caracteres. Su formato físico no es
parte del contrato: consumidores no analizan UUID, prefijos, correo ni Google `sub`.
ms-users es dueño exclusivo de cuentas, perfil, vínculos, sesiones y verificadores.
No se comparten bases de datos ni claves privadas. El mismo método legítimo debe
resolver establemente el mismo `userId`, incluso bajo concurrencia.

- Google se resuelve por `(issuer validado y canonicalizado, sub externo)`, solo en
  ms-users. Cambiar email no reasigna la identidad vinculada. Canonicalizar las
  formas oficiales de issuer solo después de validarlas evita mappings duplicados.
- Correo usa una identidad propia, nunca un `sub` Google inventado. La dirección
  verificada no es el ID interno. B02 aprueba passkeys por userId y códigos de recuperación de un uso, opcionales para básico; namespace y protocolos siguen pendientes.
- Proposed: alta transaccional idempotente tras verificar identidad y elegibilidad.
  Si la política de alta no está aprobada, no habilitarla; `REGISTRATION_REQUIRED`
  expresa registro necesario tras prueba válida. Un conflicto no crea otra cuenta,
  fusiona usuarios ni reasigna una identidad.
- Coincidir en email con una cuenta de otro método requiere vinculación explícita.
  No se promete deduplicación de personas a partir de direcciones.
- Un buzón reasignado prueba posesión actual, no titularidad histórica. Mientras los protocolos B02
  no estén aprobados, no devolver la cuenta histórica basándose solo
  en un enlace: `409 CONTINUITY_REQUIRED` tras prueba válida, sin datos de la cuenta.

La normalización propuesta conserva parte local (mayúsculas, puntos y alias) y
normaliza solo dominio, de acuerdo con `Email` inspeccionado en ms-users. Comparar
dominios exactos después de validar el correo; no comodines, sufijos parciales,
subdominios implícitos ni equivalencias Gmail. El alta por email requiere además
datos de presentación: el protocolo de completar un perfil inicial/no vacío antes
de producir `AuthenticatedUser.nombre` y `UserProfileV1` debe acordarse en B02;
no inventar nombres institucionales ni eliminar campos de compatibilidad.

### Principal de aplicación Proposed

| Campo | Origen confiable |
|---|---|
| `userId` | `sub` del JWT interno verificado, nunca del token Google o body |
| `sessionId` | `sid` interno verificado, propuesta correlacionada con sesión |
| `tokenId` | `jti` interno verificado |
| `issuedAt`, `expiresAt` | `iat`, `exp` validados en segundos |
| `scopes` | Capacidades efectivamente concedidas; vacío si no hay ninguna |

Es salida del adaptador de seguridad, no DTO de entrada. Los puertos de dominio
pueden consumir solo `userId`, como el puerto independiente existente; no necesitan
depender de HTTP/JWT. La forma completa es propuesta, no afirmación de implementación.
ms-catalog determina vendedor/emisor desde ese principal y comprueba propiedad o
participación. ms-notifications limita consultas a su destinatario autenticado y
consume eventos validados con procedencia autenticada. IDs del body/ruta seleccionan
recursos, no acreditan identidad. No consultar ms-users por cada autorización.

## 3. Intentos, Google, correo y vinculación (Proposed)

### Reglas de transporte comunes

Todas las operaciones nuevas están detalladas en OpenAPI. Cuerpos JSON de éxito
siguen la forma plana existente donde corresponde; todos los errores reutilizan
`{error:{code,message,details,correlationId,timestamp}}`. Auth restringe `details=[]`
para evitar fugas. No se añade un envelope de éxito incompatible a perfiles o auth.

- TLS obligatorio. Tokens Google, bearer, cookies, CSRF, grants, enlaces y cuerpos
  de autenticación se redactan en SPA, APIM, servidor, correo, logs y trazas.
- `X-Correlation-ID` opcional de entrada, máximo 128; validarlo/sanitizarlo y generar
  uno si falta o es inválido. Todas las respuestas propuestas incluyen el ID efectivo;
  errores lo repiten en el envelope. No utilizarlo como credencial ni idempotency key.
- Propuesta web: métodos mutadores nuevos exigen `Origin` permitido, JSON y
  `X-MTEC-Client: web`. Los GET no exigen Origin ausente en algunos fetch same-origin;
  aplican CORS exacto si existe, contexto de navegación y no tienen efectos.
  Un header de cliente/origen no es prueba de identidad.
- `Cache-Control: no-store` en auth/perfil/errores; JWKS/metadata con caché pública
  acotada a acordar. Propuesta de respuestas 401 con desafío `WWW-Authenticate`
  adecuado a bearer/cookie; el esquema exacto de sesión sigue B06.
- Subscription key conserva admisión/cuota del borrador, nunca identidad ni secreto
  de SPA. Metadata/JWKS no la necesitan. Excepciones APIM por método/ruta exactos.
- No enviar bearer/refresh por URL. Enlace de correo puede transportar solo su
  secreto efímero a página Angular fija, preferiblemente en fragmento, sin terceros,
  sin analítica, con `Referrer-Policy: no-referrer`; retirar secreto de barra/historial
  antes de otras navegaciones. No usar redirectUri de entrada arbitrario.

### Cookies y CSRF: política B06 aprobada, parámetros/protocolo Draft

| Cookie propuesta | Uso | Atributos candidatos |
|---|---|---|
| `__Host-mtec-attempt` | Vínculo aleatorio del navegador e intentos de login; no sesión | HttpOnly, Secure, Path=/, sin Domain; vencimiento no mayor al intento |
| `__Host-mtec-refresh` | Renovación opaca, familia/usuario/sid, solo ms-users | HttpOnly, Secure, Path=/, sin Domain; máximo acotado al absoluto, servidor aplica antes inactividad/ventana/revocación |

B06 aprueba HttpOnly/Secure/host-only y sincronizador CSRF. Nombres/Path son propuestas, no configuración vigente. SameSite=Lax sería candidato
solo para topología same-site; None+Secure requiere justificación, CSRF y pruebas de
cookies de terceros. Hosts/orígenes reales y soporte de navegadores no están
determinados. No rebajar HttpOnly/Secure para integrar. Con Path=/ hay que limitar
origen/rutas y redacción: backends de negocio no consumen la cookie; APIM no debe
propagarla indiscriminadamente. Varias cookies viajan como headers Set-Cookie
separados, preservados por gateway; borrado con mismo nombre/Path y Max-Age=0.

Primera creación de intento usa Origin/JSON/header personalizado y CORS sin aceptar
orígenes arbitrarios. Luego exige cookie de intento + sincronizador retornado por
servidor en `X-CSRF-Token`. Al completar login, rotar contexto y emitir cookie de
sesión con sincronizador propio. Pruebas protegidas exigen JWT + cookie de sesión
con mismo sid/usuario + CSRF. SameSite no sustituye CSRF. El callback JS actual de
GIS no añade por sí solo este protocolo; no asumir `g_csrf_token` de otro modo GIS.

### Inventario de operaciones de login y pruebas

| Método/ruta de servicio | Request → éxito | Seguridad y efecto |
|---|---|---|
| POST `/v1/auth/attempts` | `{method}` → `AttemptResponse` | Sin sesión; contexto navegador, propósito login y cliente GIS fijados por servidor |
| POST `/v1/auth/google` | `{credential,attemptId}` → `AuthResponse` 200 o `MailboxVerificationRequired` 202 | Cookie intento + CSRF; firma/claims/nonce; consumo único antes de sesión |
| POST `/v1/auth/email/requests` | `{attemptId,email}` → `EmailAccepted` 202 | Cookie intento + CSRF; emisión/reenvío sin enumeración |
| POST `/v1/auth/email/confirm` | `{attemptId,token}` → `AuthResponse` 200 | Confirmación explícita, consumo atómico, continuidad; no GET de autenticación |
| POST `/v1/auth/proofs/attempts` | `{method,purpose,authMethodId?}` → `AttemptResponse` | JWT + cookie + CSRF, propósito reauthenticate o link |
| POST `/v1/auth/proofs/google` | `{credential,attemptId}` → `ProofGrant` 200 o espera de buzón 202 | Prueba exacta del método sobre sid/usuario actuales; no nueva sesión |
| POST `/v1/auth/proofs/email/requests` | `{attemptId,email}` → `EmailAccepted` 202 | Mismo acuse genérico, método/email fijados por intento protegido |
| POST `/v1/auth/proofs/email/confirm` | `{attemptId,token}` → `ProofGrant` 200 | Consumo único sobre propósito protegido, sin ampliar sesión |
| GET `/v1/me/auth-methods` | Sin body → `MethodsResponse` 200 | JWT interno; referencias propias sin sub Google ni correo |
| POST `/v1/me/auth-methods` | `{reauthenticationProofId,newMethodProofId}` → `MethodsResponse` 200 | JWT + cookie + CSRF; ambas pruebas recientes, diferentes y consumidas en transacción |

Para Google se propone verificar firma con biblioteca mantenida y claves de destino
fijo, algoritmo permitido, emisor oficial, aud del cliente de ese intento, azp si
presente, tipos/coherencia iat/exp/nbf, nonce y elegibilidad. RS256, aud única y
canonicalización son pendientes P18/P21. `email_verified=true` sin autoridad de
Google sobre buzón de terceros no basta: responder 202, retener evidencia Google
verificada y requerir prueba institucional del mismo intento; no crear sesión,
cuenta ni EmailIdentity implícita antes de completarla. El destinatario de esa
prueba adicional queda fijado al email de la evidencia Google validada y al mismo
issuer/sub, intento y propósito. No se puede acreditar esa identidad usando otro
buzón: solicitar otro email conserva 202, sin envío ni cambio del destinatario;
confirmar solo acepta el secreto emitido para esa evidencia. No se confía en hd del botón.
[Google documenta la distinción de autoridad del buzón](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

Nonce generado en servidor, CSPRNG 256 bits y TTL 300 s son candidatos ADR-004,
no acuerdos nuevos. Intento fija navegador, propósito, cliente y nonce; la prueba
Google puede consumirse una sola vez, incluso si luego espera buzón. Nueva
autenticación tras fallo terminal usa otro intento. No reproducir credenciales
ante respuesta perdida. En pruebas protegidas, reautenticación exige método ya
vinculado; link fija identidad nueva. No intercambiar sus grants ni usar el mismo
grant para ambos papeles. `iat`/nonce recientes no acreditan interacción reciente;
B04 bloquea habilitar pruebas sensibles hasta acordar evidencia de frescura.

Correo propone secreto CSPRNG 256 bits, verificador hash y plazo de hasta 600 s,
acotado además al intento. Registrar en servidor propósito, destinatario verificado,
intento, vencimiento y estado; no elegir aquí almacenamiento. Acuse idéntico para
toda dirección sintácticamente válida, incluso no elegible o inexistente; solo se
envía cuando corresponde. Tiempos comparables y límites combinados por origen,
global, destinatario e intento. Tasa por destinatario se oculta tras 202; 429/Retry-After
solo por origen/global independiente de cuenta. Cooldown no reenvía; reenvío
autorizado invalida enlace anterior, no prolonga intento. Tasas/cooldown exactos pendientes.

GET/HEAD/preview del enlace no consumen ni autentican. Solo POST explícito con
cookie/CSRF del intento original valida/consume. Otro navegador/dispositivo reinicia
el flujo allí; no trasladar sesión con enlace. Es compatibilidad limitada deliberada
en propuesta, pendiente aceptación UX/seguridad; cross-device requeriría protocolo
adicional aprobado. Token alterado/ajeno → 401 genérico; intento vencido → 410;
consumido → 409, sin revelar cuenta. Carrera: máximo un consumo y una sesión/grant.
Entrega fallida no crea usuario/sesión. Respuesta perdida tras consumo obliga nuevo
intento. Email histórico sin continuidad aprobada → B02, no recuperación automática.

Al vincular, verificar atomicidad y unicidad de identidad: otro userId produce
conflicto genérico sin fusión. Ambas pruebas deben estar vigentes y ligadas al mismo
sid/usuario, propósito e identidad exacta. Preservar userId. Repetir grants consumidos
da 409; consultar métodos propios para reconciliar una respuesta perdida. Nueva
prueba de método ya propio permite no-op de vínculo. Recuperación sin ningún método,
unlink y cambio de correo quedan fuera hasta política aprobada.

## 4. Sesiones y credenciales

### Invariantes de la política Accepted

El servidor usa su propio reloj y estado; el cliente no fija tiempos ni vigencia.
Todos los tiempos de estos DTOs son segundos enteros, sin aprobar ADR-003 general.
Sea `a` autenticación inicial, `r` última continuación voluntaria aprobada y `h`
última actividad elegible respaldada por servidor (B03), no prueba de humanidad. Inicialmente `r=h=a`.

```text
absoluteExpiresAt   = a + 28800
windowExpiresAt     = min(r + 3600, absoluteExpiresAt)
inactivityExpiresAt = min(h + 1800, absoluteExpiresAt)
expiresAt           = min(windowExpiresAt, inactivityExpiresAt, absoluteExpiresAt)
vigente            = status == active AND serverTime < expiresAt
```

En el instante de igualdad ya está vencida. Revocación puede terminar antes.
`SessionSnapshot` de éxito solo admite active, tiempos coherentes y vigencia.
Relaciones entre campos requieren validación semántica además del Schema.

Una continuación válida antes del vencimiento puede mover `r` a now, nunca `a`;
no modifica `h` por sí sola. Actividad aprobada mueve `h`, no `r` ni `a`. Sondeos,
heartbeats, GET de estado y rotación automática no son actividad. Al alcanzar el
primer límite no se renueva: nueva autenticación por uno de los dos métodos, con
nuevo sid/origen absoluto; no basta un clic de continuar. Un access JWT vencido
puede renovarse solo si cookie y sesión aún vigentes. Sesión agotada/revocada no.

`warningAt < expiresAt` es obligatorio: lo calcula servidor con anticipación
aprobada por UX/seguridad; cinco minutos es solo candidato. Angular avisa al recibir
snapshot ya dentro del intervalo, corrige reloj usando serverTime y no toma su
temporizador como autoridad. JWT nominal máximo aprobado de 240 s, con garantía temporal pendiente, no equivale a ventana de
60 min; `AuthResponse.expiresAt <= session.expiresAt`. Sin vigencia restante positiva
no emitir. Credencial nunca puede autorizar acceso más allá del límite real exigido;
skew positivo no puede extenderlo implícitamente.

### Operaciones Proposed

| Operación | Seguridad | Semántica |
|---|---|---|
| GET `/v1/auth/session` → `SessionResponse` | Cookie de sesión, CORS/origen permitido, header web | Snapshot/usuario/CSRF, sin bearer nuevo, sin rotación/actividad/renovación |
| POST `/v1/auth/refresh` `{mode}` → `AuthResponse` | Cookie sesión + CSRF; no exige access vigente | rotate sustituye acceso/refresh; continue pide nueva ventana solo vigente |
| POST `/v1/auth/session/activity` `{interactionId,kind}` → snapshot | JWT + cookie coincidentes + CSRF | Condicional a B03: deduplica y evalúa señal; no confía en timestamps cliente |
| POST `/v1/auth/logout` `{scope,reauthenticationProofId?}` → 204 | Cookie + CSRF si existe; all requiere sesión vigente y prueba reciente | current revoca familia y elimina cookie; all revoca todas las sesiones propias |

B03 aprueba solo actividad de negocio elegible respaldada por evidencia autenticada
de servidor, con timestamp del instante real de ejecución y cómputo único. Se
admite procesamiento tardío de hasta 60 s, únicamente si la sesión sigue vigente
con su estado **previo** a aplicar la señal; igualdad con el deadline ya expira.
Nunca usar recepción tardía como actividad nueva ni reactivar sesión expirada.
La actualización propuesta es `h=max(h,tEjecución)`, sin mover `r` ni `a`.
Allowlist, evidencia, productor/correlación, reloj y deduplicación atómica requieren
contrato y pruebas. `ActivityRequest` actual solo lleva interactionId/kind y no
demuestra ese respaldo: sigue bloqueado, sin inventar un protocolo de productores.

B06/D6 aprueba serialización incluso entre pestañas, sin gracia general. La
[política C aprobada](../../docs/MTEC40_REFRESH_REPLAY_DECISION_PROPOSAL.md)
exige consumo único y reemplazo atómico: una carrera produce como máximo una
ganadora. Una pareja histórica refresh + CSRF coincidente de sesión aún vigente se
clasifica internamente como replay y exige auditoría estructurada sin secretos;
generación inexistente o CSRF distinto son prueba inválida, no replay confirmado.
Toda generación consumida se rechaza sin reemitir credenciales. La respuesta
pública de refresh inválido, consumido o sesión cerrada es `401 REFRESH_INVALID`,
con envelope genérico y sin JWT, CSRF ni cookie nueva. Un replay aislado no revoca
automáticamente la generación ganadora ni cambia deadlines. Revocar por compromiso
requiere evidencia independiente y autorización registrada; el evento estructurado
y el procedimiento de incidente siguen pendientes de implementación y pruebas.

Frontend serializa renovación entre solicitudes/pestañas y evita retries automáticos.
Si la respuesta se pierde después del commit y llegó la cookie nueva, puede
recuperar CSRF/estado mediante GET `/v1/auth/session`; si conserva la cookie
consumida, debe reautenticar. Una sesión vencida o revocada nunca se reactiva y
refresh no extiende por sí solo los límites 60/30/8. `mode=rotate` y logout
`scope=current` están implementados en ms-users; `mode=continue` y
`scope=all` siguen pendientes. La interfaz completa continúa **Draft** hasta
MTEC-15/B07. El riesgo aceptado es que un atacante que gane la primera rotación
puede conservar la generación activa hasta vencimiento o revocación efectiva.
[RFC 9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14)
informa el análisis de rotación; no se declara OAuth implementado ni conformidad
con su pauta de revocación automática.

Logout current es idempotente: 204 para familia ya cerrada y para cookie ausente
(sin efecto servidor); origen/JSON/header web siguen requeridos y, con cookie,
CSRF es obligatorio. all exige prueba reciente ligada al usuario/sid y cookie
vigente; si faltan 401/403, nunca rebajar a current. Repetición all con sesión ya
cerrada devuelve 401 sin nuevo efecto. 204 acredita revocación en ms-users, no
propagación a validadores. Baja/compromiso deben usar política global en implementación
futura. B01 impide prometer revocación distribuida por la mera respuesta de logout.

**Bloqueo B01:** validación local de firma/exp por sí sola no observa cambios de
estado. Acotar `exp` a los deadlines conocidos al emitir impide sobrepasar esos
deadlines fijos (sin skew adicional), pero no corta revocación posterior ni garantiza
la medición/consistencia de actividad. Logout puede dejar aceptación de JWT previos dentro del residual ordinario
≤300 s solo si se demuestran las cotas de B01; cero leeway positivo no elimina
desfase de reloj. Esa garantía está **Documentada pero no verificada**. `sid`, `jti`, versión de sesión, borrar cookie o retirar una clave
de JWKS sin distribuir el cambio no resuelven eso. El informe compara estrategias;
ninguna queda seleccionada. No se acepta residual tras vencimiento de sesión. D4/D5 siguen Proposed: no
se especifica como definitiva la entrega/confirmación de operaciones en curso ni
la infraestructura o respuesta a incidentes críticos; sin garantías, bloquear lo afectado.

## 5. Perfil propio, errores y compatibilidad Angular

GET/PUT `/v1/usuarios/{userId}` conservan DTOs y mapping público previos. Proposed:
solo propietario, con JWT interno y comparación del parámetro contra principal;
otro usuario recibe 403 sin revelar existencia. No se crea un directorio público.
Se añaden GET/PUT `/v1/me/profile`, que derivan usuario del principal y preservan
`UserProfileV1`, `UpdateUserRequest` y `UpdateUserResponseV1`. El alias usa otro prefijo
para no reservar ni ocultar ningún ID opaco en `/usuarios/{userId}`.
PUT solo cambia nombreUsuario/nombre/apellidos; no correo, roles, verificado ni estado.
Fechas string e ID string previos permanecen; createdAt sigue opcional pendiente ADR-003.

Errores Proposed: 400 solicitud inválida; 401 credencial/prueba/sesión inválida,
vencida, revocada o refresh inválido/consumido; 403 principal sin permiso, origen/CSRF o
reautenticación insuficiente; 404 recurso propio inexistente; 409 conflicto/consumo/
continuidad/registro/actividad no aceptada; 410 intento expirado; 429 tasa global/origen
con Retry-After; 503 verificación/emisión no disponible sin degradar seguridad.
OpenAPI restringe los códigos por estado HTTP y mantiene details=[] también en
el 404 de perfil. Antes de una prueba válida, solicitudes de correo no devuelven
ELIGIBILITY_DENIED, CONTINUITY_REQUIRED ni REGISTRATION_REQUIRED: elegibilidad,
existencia y tasa por destinatario conservan 202; los errores solo rechazan contexto
o disponibilidad. No incluir razón criptográfica, cuenta ajena,
dirección o proveedor en detalles. Error desconocido no habilita fallback de identidad.

MTEC-10 deberá consumir los intentos/login, session/refresh/logout, snapshot/aviso,
perfil propio y, si se habilita UI de vínculo, pruebas y métodos. Sustituir ID token
Google guardado como sesión por AuthResponse interno; guardar acceso y sincronizador CSRF solo
en memoria y usar withCredentials solo en destinos/rutas autorizados. Google `sub`
no se pasa a perfiles/publicaciones. `USR-001` se sustituye por user.userId o perfil
propio; publicaciones propias aún necesitan contrato de catálogo revisado después.

El interceptor necesitará distinguir rutas de login/metadata/cookie y de negocio,
no adjuntar Google bearer, coordinar un refresh a la vez y evitar bucles de 401.
ACCESS_TOKEN_EXPIRED permite intentar refresh solo con sesión vigente; SESSION_EXPIRED,
SESSION_REVOKED y REFRESH_INVALID requieren reautenticación cuando no existe una cookie nueva vigente. Un 401 por carrera en otra pestaña no debe cerrar la sesión ganadora; Angular debe verificar el estado compartido antes de descartarla. 403 es denegación,
no disparador de refresh. Errores tardíos no invalidan sesión nueva. Cookie ausente/
bloqueada requiere reautenticación y diagnóstico UX, no almacenamiento alternativo
inseguro. Todo es evaluación futura: Angular no se modifica aquí.

## 6. JWT, JWKS y metadata: perfil aprobado, interfaz Draft

RS256/RSA-2048 aprobado; claims obligatorios `iss`, `aud`, `sub=userId` interno,
`sid`, `iat`, `exp`, `jti`. **`kid` en encabezado JOSE, nunca como claim.**
Header `typ=at+jwt`, tipos NumericDate enteros, aud string y `nbf` opcional
son restricciones de diseño Draft existentes; valores exactos de issuer/audience
y perfil final por entorno/validador deben cerrarse antes de implementación.
Validar estrictamente firma, algoritmo permitido, clave pública confiable, issuer,
audiencia y tiempos. `0 < exp-iat ≤240 s`, sin tolerancia positiva a `exp`:
igualdad expira. `nbf` presente exige tipo/coherencia y no aceptar antes de él.
No seguir `jku`/`x5u` ni claves embebidas del token. No PII sensible ni roles por
dominio; un schema no valida firma ni origen del identificador.

`exp` efectivo y `AuthResponse.expiresAt` se acotan al primer deadline de sesión;
la respuesta debe reflejar el exp del token. La emisión debe descontar un margen
seguro medido para reloj y demora hasta admisión; `exp≤deadline` por sí solo no
demuestra el corte real. La fórmula de diseño `exp=floor(min(iat+240,Ds)-m)`
requiere demostrar `m`; no se asigna valor. `TTL+presupuestoTotal≤300 s` exige
prueba end-to-end desde revocación autoritativa hasta admisión en cada validador,
además del corte estricto 60/30/8. Los 60 s aritméticos restantes no son skew
aprobado ni los 60 s de procesamiento de actividad B03. Si no cabe, reducir TTL
o rechazar. Ordenar emisión/refresh con revocación para no emitir después.

Fail-closed B01/D2 si falta firma, algoritmo, clave/frescura, reloj o tiempo
verificable. Caída de ms-users impide autenticación/refresh dependientes, pero
permite JWT previos localmente verificables con confianza y tiempo vigentes;
no introduce consulta a ms-users por request. D4/D5 siguen sin resolver el
trabajo en curso y la contención crítica. Los hosts `.invalid` son solo fixtures.

APIM y cada backend validan perfil y claves configurados, sin fallback Google,
`none`, HMAC, URL de clave del token ni headers de identidad del navegador. JWT del
usuario puede viajar de APIM a su destinatario; trabajo entre servicios usa identidad
de servicio y delegación explícita con audiencia/propósito acotados si procede.
No se diseña token exchange de workloads ni se comparte firma privada.

| GET público propuesto | Contrato | Restricción |
|---|---|---|
| `/.well-known/jwks.json` | `Jwks` con keys públicas kty/use/alg/kid/n/e | Sin privados, kid único, RSA-2048 válido en runtime |
| `/.well-known/markettec-identity` | `IdentityMetadata`: issuer, jwks_uri, audiences, algorithms, type, version | Metadata propia; no OpenID Provider Discovery ni OAuth/OIDC completo |

Publicación sin bearer/cookie/subscription key evita ciclo de arranque. Fijar destinos
HTTPS por configuración; no descubrir emisor desde JWT no confiable. `kid` desconocido
permite refresco limitado de destino fijado; si no hay clave válida rechazar. Clave
conocida durante caída solo con caché acotada aprobada; nunca confiar indefinidamente.
Duplicados de kid/material privado invalidan publicación. Rotación: publicar antes
de firmar, comprobar propagación, solapar hasta último exp/skew/cachés y retirar con
evidencia. Compromiso requiere retirar confianza en todos o suspender rutas hasta
recuperación; no basta quitar clave de JWKS.

**B05/D2 aprobado:** JWKS público y aprovisionamiento controlado de públicas para APIM/validadores; no usar metadata propia en `openid-config` APIM. Microsoft exige metadata
conforme de OpenID y documenta cachés; cerrar procedimiento de aprovisionamiento, caché/frescura/rotación y
propagación, probar Java/Node/Python/APIM antes de
integrar. Esta propuesta no inventa authorization/token endpoints para aparentar
un proveedor OIDC. [Referencia primaria APIM](https://learn.microsoft.com/en-us/azure/api-management/validate-jwt-policy).

## 7. Matriz de admisión e integración

| Clase | Operaciones | APIM / backend |
|---|---|---|
| Pública técnica | GET health | Información mínima; política de exposición pendiente, no acceso de negocio |
| Pública metadata | GET JWKS y metadata | Sin dependencia de JWT/cookie/key; TLS/cache/tasa y destino confiable |
| Sin sesión previa, controles propios | POST auth/attempts, auth/google, auth/email/requests y confirm | Sin exigir JWT interno; clave de admisión si corresponde, origen/CSRF/cookie/prueba/tasa según operación |
| Cookie de sesión | GET auth/session, POST auth/refresh y logout | Sin access JWT previo; ms-users verifica estado/CSRF; logout current ausente es no-op explícito |
| JWT interno | GET/PUT usuarios/{id}, GET/PUT me/profile, GET me/auth-methods | Firma/claims en APIM y backend; propietario/autorización en ms-users |
| JWT + sesión | Activity, proofs/* y POST me/auth-methods | Mismo sid/userId JWT-cookie y CSRF; grants y estado en ms-users |
| Negocio de otros servicios | GET publicaciones/listado/detalle y notificaciones en sus borradores; futuras escrituras/chats | JWT interno validado, propiedad/participación en dueño; cambios requeridos solo en informe |
| Operaciones internas | Ninguna ruta nueva aquí | Identidad de servicio y delegación explícita futura; eventos no transportan credenciales |

Preflight OPTIONS se limita a origen/método/headers permitidos; no ejecuta la
operación ni autoriza negocio. B06 aprueba sincronizador CSRF/CORS explícito y preferencia same-site; cerrar topología, cookies y headers expuestos
X-Correlation-ID/Retry-After y manejo de error gateway con mismo envelope.
No wildcard de excepción `/auth/*` que habilite pruebas protegidas.
Backend requiere origen gateway autenticado además de revalidar JWT según
ADR-004; control real de red/certificados queda MTEC-12, no asumido aquí.

## 8. Versionado, aprobación y pruebas

**Candidata 0.3.0-draft**, pendiente de B07 y aprobación MTEC-15. Frente a
0.2.0-draft conserva rutas/DTOs de perfil, health, eventos y contratos ajenos;
cambia reglas temporales y metadatos de versión:

| Diferencia | Compatibilidad / condición |
|---|---|
| JWT de candidato 900 s a máximo 240 s, RS256/RSA-2048, kid JOSE y cero leeway positivo | Cambio semántico incompatible con emisores/validadores antiguos, aunque claims conserven forma. Revisión coordinada; sin fallback al perfil anterior |
| `contract_version` de metadata 0.3.0-draft | Incompatible con validadores que fijan const 0.2.0-draft; acordar consumo/corte |
| Header JOSE explícito y políticas JWT/JWKS/transporte | Aditivo en descripción/schema; no demuestra interoperabilidad ni aprueba parámetros candidatos |
| B02 continuidad y B03 tiempo real/cómputo único | Políticas aprobadas; las interfaces existentes no bastan para evidencia/alta aislada. Mantener bloqueadas, sin inventar endpoints |
| Access/CSRF solo memoria, cookie segura host-only y refresh entre pestañas | Política aprobada; protocolo/topología/errores aún Draft. Angular actual requiere migración |
| Aviso | Se basa en deadline efectivo de sesión; 300 s es candidato y protocolo pendiente, no preaviso del JWT |

La incompatibilidad heredada 0.1→0.2 permanece: intento/cookie/CSRF en Google,
session/csrfToken requeridos en AuthResponse cerrado y perfil restringido al dueño.
No desplegar silenciosamente sobre consumidores antiguos. La [release review B07](../../docs/MTEC15_AUTH_CONTRACT_RELEASE_REVIEW.md)
registra superficies listas, condicionadas/bloqueadas y checklist de conformidades.

Validar OpenAPI, Schema 2020-12, referencias, fixtures y límites entre campos.
Los vectores JWT sintéticos verifican rechazo con un **oráculo de prueba** aislado;
no implementan autenticación de aplicación ni certifican Java/Node/Python/APIM.
Quedan **Documentados pero no verificados** residual ≤300 s, clocks, propagación,
carreras, cookies/CSRF/CORS y evidencia real de continuidad/frescura/actividad.
Conservar B01 D4/D5, B04, protocolos B02/B03 y parámetros B05/B06 como pendientes.
B07 requiere conformidades explícitas y consumo canónico; pasar QA estático no
aprueba contratos, no inicia MTEC-36 ni cambia estados Jira.
