# Contrato compartido de identidad y autenticación

**Estado:** Proposed — pendiente de aprobación MTEC-15/MTEC-40
**Versión de diseño:** 0.2.0-draft (sustituye el borrador 0.1, con incompatibilidades explícitas)
**Destinatarios:** mantenedores de Angular, ms-users, ms-catalog, ms-notifications y APIM
**Base examinada:** `market_tec@4c087f847be73ea1be59f41cabee95c8ca94448b`, 2026-11-02

## 1. Autoridad y estado

[ADR-001](../../context/decisions/ADR-001-distribucion-microservicios.md) y
[ADR-004 §2.1](../../context/decisions/ADR-004-seguridad-autenticacion.md#21-arquitectura-base-aceptada-y-límites-de-aprobación)
son la autoridad de las responsabilidades y del núcleo aceptado. Este documento
propone su interfaz compartida; no aprueba criptografía, almacenamiento, topología
ni controles de seguridad pendientes. [Users OpenAPI](../openapi/users.json)
especifica métodos, rutas, headers, cuerpos, esquemas, respuestas y errores. El
[informe de revisión](../../docs/MTEC15_AUTH_CONTRACT_REVIEW.md) contiene evidencia,
comparación de alternativas, compatibilidad y bloqueos, sin constituir otro contrato.

**Verificado:** solo `GET /health` está implementado en la fundación ms-users de
esta base. Google, perfiles y todas las nuevas operaciones de este contrato siguen
`x-implementation-status: proposed`; el estado global es
`draft-pending-team-approval`. **No determinado:** configuración efectiva Azure/APIM.

### Núcleo aceptado y detalles propuestos

| Tema | Accepted según ADR-004 | Proposed / pendiente |
|---|---|---|
| Métodos | Google y enlace institucional simultáneamente desde v1 | Protocolos, TTL, tasas, pruebas y errores de las operaciones siguientes |
| Elegibilidad | Control verificado de correo de dominio exacto `estudiantec.cr`, `itcr.ac.cr` o `tec.ac.cr`; acceso básico sin prueba de matrícula/empleo | Canonicalización técnica, alta idempotente y continuidad de cuentas históricas |
| Identidad | `userId` interno opaco, estable, generado por ms-users; no fusión por email | Mapping contractual, namespace de EmailIdentity y prueba reciente de ambos métodos |
| Sesión | 60 min renovables, 30 min inactividad, 8 h absolutas; primer límite, servidor, aviso y reautenticación; sondeos no son actividad | Actividad, refresh, transporte, anticipación del aviso y cumplimiento distribuido |
| Confianza | ms-users autentica/emite/publica claves; APIM admite; cada backend revalida y autoriza su dominio | Perfil JWT, claves, rotación, protección de origen y reglas efectivas APIM |
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
  verificada no es el ID interno. Namespace y prueba de continuidad siguen B02.
- Proposed: alta transaccional idempotente tras verificar identidad y elegibilidad.
  Si la política de alta no está aprobada, no habilitarla; `REGISTRATION_REQUIRED`
  expresa registro necesario tras prueba válida. Un conflicto no crea otra cuenta,
  fusiona usuarios ni reasigna una identidad.
- Coincidir en email con una cuenta de otro método requiere vinculación explícita.
  No se promete deduplicación de personas a partir de direcciones.
- Un buzón reasignado prueba posesión actual, no titularidad histórica. Mientras B02
  no tenga procedimiento aprobado, no devolver la cuenta histórica basándose solo
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

### Cookies y CSRF: propuesta pendiente B06

| Cookie propuesta | Uso | Atributos candidatos |
|---|---|---|
| `__Host-mtec-attempt` | Vínculo aleatorio del navegador e intentos de login; no sesión | HttpOnly, Secure, Path=/, sin Domain; vencimiento no mayor al intento |
| `__Host-mtec-refresh` | Renovación opaca, familia/usuario/sid, solo ms-users | HttpOnly, Secure, Path=/, sin Domain; máximo acotado al absoluto, servidor aplica antes inactividad/ventana/revocación |

Nombres/Path son propuestas, no configuración vigente. SameSite=Lax sería candidato
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
última actividad humana reconocida por servidor. Inicialmente `r=h=a`.

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
temporizador como autoridad. JWT propuesto de hasta 900 s no equivale a ventana de
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

La señal de actividad no demuestra humanidad por ser enviada desde JS. B03 debe
definir reconocimiento, antifalsificación, reloj y coordinación entre APIM/servicios;
si no puede demostrarse, mantener bloqueado, no sustituirlo por un booleano cliente.
Actividad sin sesión vigente o simultánea a expiración no resucita sesión.

Rotación estricta sin gracia es **Proposed**, conforme a la alternativa ADR-004:
verificar/consumir la generación actual y emitir siguiente atómicamente. Dos usos
concurrentes: uno gana; reconocer la generación consumida en el segundo revoca la
familia, incluido el reemplazo del ganador, y responde `401 REFRESH_REUSED`. Es coste
de disponibilidad explícito. Preservar verificadores consumidos lo suficiente para
detectar reuso, con retención pendiente. No asumir que dos pestañas sean atacante.
Frontend serializa renovación entre solicitudes/pestañas; respuesta perdida exige
reautenticación, sin retry ciego. Gracia o idempotencia con reemisión necesita otro
protocolo/revisión, no una ventana reutilizable implícita. Referencia de rotación:
[RFC 9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14), sin declarar OAuth implementado.

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
la medición/consistencia de actividad. Logout puede dejar aceptación hasta `exp`
más skew/desfase. `sid`, `jti`, versión de sesión, borrar cookie o retirar una clave
de JWKS sin distribuir el cambio no resuelven eso. El informe compara estrategias;
ninguna queda seleccionada. No se acepta residual tras vencimiento de sesión ni se
promete SLA de corte sin decisión y prueba en todos los validadores.

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
vencida, revocada o refresh reusado; 403 principal sin permiso, origen/CSRF o
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
Google guardado como sesión por AuthResponse interno; guardar acceso preferentemente
en memoria y usar withCredentials solo en destinos/rutas autorizados. Google `sub`
no se pasa a perfiles/publicaciones. `USR-001` se sustituye por user.userId o perfil
propio; publicaciones propias aún necesitan contrato de catálogo revisado después.

El interceptor necesitará distinguir rutas de login/metadata/cookie y de negocio,
no adjuntar Google bearer, coordinar un refresh a la vez y evitar bucles de 401.
ACCESS_TOKEN_EXPIRED permite intentar refresh solo con sesión vigente; SESSION_EXPIRED,
SESSION_REVOKED y REFRESH_REUSED terminan sesión y requieren login. 403 es denegación,
no disparador de refresh. Errores tardíos no invalidan sesión nueva. Cookie ausente/
bloqueada requiere reautenticación y diagnóstico UX, no almacenamiento alternativo
inseguro. Todo es evaluación futura: Angular no se modifica aquí.

## 6. JWT, JWKS y metadata (Proposed)

Perfil candidato: RS256 únicamente, `kid` obligatorio, tipo JOSE `at+jwt`, iss HTTPS
exacto por entorno, aud explícita, sub interno, sid, iat/exp/jti obligatorios; nbf
validado si existe. Scopes sin privilegios implícitos. Valores reales, tamaños RSA,
skew, vida máxima, namespaces, custodia y permisos requieren MTEC-40. Los valores
`.invalid` de fixtures son aislados, no entornos existentes. JWT firmado no cifra
claims; omitir PII y secretos. Esquema de claims no verifica firma ni origen del ID.

APIM y cada backend validan perfil y claves configurados, sin fallback Google,
`none`, HMAC, URL de clave del token ni headers de identidad del navegador. JWT del
usuario puede viajar de APIM a su destinatario; trabajo entre servicios usa identidad
de servicio y delegación explícita con audiencia/propósito acotados si procede.
No se diseña token exchange de workloads ni se comparte firma privada.

| GET público propuesto | Contrato | Restricción |
|---|---|---|
| `/.well-known/jwks.json` | `Jwks` con keys públicas kty/use/alg/kid/n/e | Sin privados, kid único, RSA válido/tamaño aprobado en runtime |
| `/.well-known/markettec-identity` | `IdentityMetadata`: issuer, jwks_uri, audiences, algorithms, type, version | Metadata propia; no OpenID Provider Discovery ni OAuth/OIDC completo |

Publicación sin bearer/cookie/subscription key evita ciclo de arranque. Fijar destinos
HTTPS por configuración; no descubrir emisor desde JWT no confiable. `kid` desconocido
permite refresco limitado de destino fijado; si no hay clave válida rechazar. Clave
conocida durante caída solo con caché acotada aprobada; nunca confiar indefinidamente.
Duplicados de kid/material privado invalidan publicación. Rotación: publicar antes
de firmar, comprobar propagación, solapar hasta último exp/skew/cachés y retirar con
evidencia. Compromiso requiere retirar confianza en todos o suspender rutas hasta
recuperación; no basta quitar clave de JWKS.

**B05:** no usar metadata propia en `openid-config` APIM. Microsoft exige metadata
conforme de OpenID y documenta cachés; decidir aprovisionamiento de claves públicas
controlado o una futura interfaz conforme, probar Java/Node/Python/APIM antes de
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
operación ni autoriza negocio. B06 debe cerrar cookies/CORS/headers expuestos
X-Correlation-ID/Retry-After y manejo de error gateway con mismo envelope.
No wildcard de excepción `/auth/*` que habilite pruebas protegidas.
Backend requiere origen gateway autenticado además de revalidar JWT según
ADR-004; control real de red/certificados queda MTEC-12, no asumido aquí.

## 8. Versionado, aprobación y pruebas

0.2.0-draft declara incompatibilidad respecto de 0.1: Google requiere intento y
CSRF/cookie; AuthResponse añade campos requeridos que el esquema anterior cerrado
rechaza; perfil GET se limita a propietario. No se sirve silenciosamente sobre
una implementación 0.1: acordar corte de consumidores/versión de API antes de
implementar. Se conservan rutas previas, DTOs de perfil, health, contratos ajenos y
eventos. Las rutas añadidas son aditivas en inventario; eso no demuestra compatibilidad
del flujo de sesión ni de validadores estrictos.

Bloqueos de aprobación: B01 cumplimiento/revocación distribuidos; B02 continuidad,
namespace/alta y perfil inicial email; B03 actividad humana; B04 reautenticación
reciente; B05 perfil JWT/JWKS/APIM; B06 transporte/UX/errores de sesión; B07
conformidades de responsables y consumo canónico/corte de repositorio. Detalle,
riesgos, alternativas y preguntas en el informe de revisión; no hay aprobación
implícita de ninguno por pasar un linter.

Validar Redocly, Schema Draft 2020-12, referencias, fixtures positivos/negativos,
límites temporales y regresión de contratos ajenos. Pruebas contractuales describen
formas e invariantes; no implementan ni certifican verificación criptográfica,
consumo transaccional, humanidad, continuidad, CORS o revocación. Faltan pruebas
backend y navegadores, interoperabilidad Java/Node/Python, y luego evidencia APIM
autorizada. No iniciar MTEC-36 ni modificar ADR-004/DECISION_LOG para aprobar esto.
