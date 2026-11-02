# MTEC-15 — QA independiente de contratos de autenticación

**Fecha:** 2026-11-02. **Destinatarios:** mantenedores de ms-users, ms-catalog,
ms-notifications, Angular, APIM/infraestructura, seguridad y responsable del proyecto.

**Calidad documental y contractual: QA PASS WITH NOTES.** El borrador corregido
puede publicarse para revisión humana en una subfase posterior autorizada.
**Aprobación para implementación: BLOCKED.** B01–B07 siguen abiertos; no existe
conformidad conjunta ni demostración de las garantías distribuidas. Este dictamen
no aprueba interfaces, parámetros Proposed, publicación Git ni inicio de MTEC-36.

## 1. Alcance, metodología y límites

Auditoría de los siete archivos indicados en la solicitud, con correcciones
limitadas a ese alcance y este informe técnico adicional. Base y HEAD comprobados:
`4c087f847be73ea1be59f41cabee95c8ca94448b`, rama
`feat/mtec15-auth-contracts`, worktree persistente
`/Users/allanaron06122005gmail.com/Developer/MarketTec/worktrees/market-tec-mtec15-auth-contracts`.
Se inspeccionaron estado Git y diff antes de editar. La entrada tenía dos archivos
rastreados modificados y cinco nuevos, sin staging. Se preservó la evidencia del
[informe de subfase 1](MTEC15_AUTH_CONTRACT_REVIEW.md), cuyos resultados son históricos.

Se contrastaron [ADR-004 §2.1](../context/decisions/ADR-004-seguridad-autenticacion.md#21-arquitectura-base-aceptada-y-límites-de-aprobación),
[identidad](../contracts/identity/IDENTITY_CONTRACT.md),
[Users OpenAPI](../contracts/openapi/users.json), fixtures, validadores y
[workflow](../.github/workflows/ci-contracts.yml). Se revisaron los consumidores
Angular de login, token, interceptor y perfil, el controlador health de ms-users,
la documentación de integración y el protocolo de mantenimiento.

**Verificado:** consultas de solo lectura a [MTEC-15](https://allanaron06122005.atlassian.net/browse/MTEC-15),
[MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) y
[MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36): respectivamente
In Progress, In Progress y To Do; continúan exigiendo acuerdos y revisión conjunta.
No se modificaron tickets. No se repitió la investigación del repositorio
independiente de ms-users: sus hallazgos fechados permanecen en la subfase 1 y
**Documentado pero no verificado** nuevamente es su estado remoto/operativo.

**Verificado** en esta auditoría significa inspección local, consulta indicada o
prueba ejecutada; **Inferido** identifica consecuencias del diseño;
**No determinado** corresponde a despliegue, aprobaciones no acreditadas o
comportamiento remoto. Las pruebas son contractuales: no acreditan criptografía,
atomicidad, entrega de correo, humanidad, continuidad de buzón ni revocación real.

## 2. Inventario verificado y compatibilidad

| Comprobación directa | Resultado |
|---|---|
| Versión OpenAPI Users | `0.2.0-draft`; `draft-pending-team-approval` |
| Operaciones totales | 21 |
| Implementadas | Una: `GET /health`, contrastada con HealthController |
| Propuestas | 20; ninguna declarada implementada por esta auditoría |
| Operaciones de base 0.1 | Cuatro; comparación contra `git show` del commit base |
| Operaciones añadidas | 17; sin retirar las cuatro anteriores |
| Componentes de esquema Users | 33; metaschema Draft 2020-12 válido |
| Fixtures auth / política temporal | 42 casos de forma/semántica y 13 vectores temporales |
| Respuestas de error declaradas | 117 combinaciones operación/estado, comprobadas por la suite |

Los hashes del fixture [compatibility-baseline](../contracts/examples/auth/compatibility-baseline.json)
se contrastaron directamente con los objetos del commit fuente mediante `git show`,
además de la comprobación de los archivos actuales. No se regeneró el baseline
para aceptar cambios. Health y ocho esquemas preservados, incluidos UserId,
AuthenticatedUser, DTOs de perfil y ErrorEnvelope, coinciden semánticamente con la
base; catálogo, notificaciones, evento y sus fixtures coinciden por bytes.

Las incompatibilidades están declaradas en `x-design-review.breakingChanges`,
identidad §8 y el informe anterior:

- GoogleAuthRequest requiere attemptId y contexto cookie/CSRF; credential solo ya
  no basta.
- AuthResponse exige session/csrfToken; el esquema 0.1 cerrado rechaza esa respuesta.
- GET de perfil exige propietario; deja de representar un posible directorio.

Las correcciones QA estrechan los códigos HTTP y las respuestas de error, y
completan controles del PUT legado. Conservan versión y estado de borrador sin
atribuir compatibilidad dinámica. Angular sigue guardando el token Google, deriva
su identidad visual de sub y no hace intercambio HTTP en signIn; su interceptor
no implementa refresh/cookies y su perfil aún tiene el problema de USR-001
registrado en la revisión previa. Los DTOs conservados no vuelven interoperable
ese flujo. B07 exige acordar corte/versionado y responsables antes de servir 0.2.

## 3. Hallazgos y correcciones

Las severidades siguientes evalúan el contrato y su riesgo si se implementara;
no afirman una explotación en producción.

| ID / severidad | Evidencia reproducida antes de corregir | Riesgo | Corrección / estado |
|---|---|---|---|
| Q01 / Media | Auth400 y los otros errores usaban AuthErrorEnvelope sin restricción por estado. El validador aceptaba `SESSION_REVOKED` en HTTP 400 | Consumidores y servidores pueden discrepar al decidir refresh, login o rechazo | Cada respuesta restringe code al conjunto de su estado; prueba cruza todos los códigos con cada operación/estado |
| Q02 / Alta | Las solicitudes de correo declaraban `ELIGIBILITY_DENIED` en 403 y `CONTINUITY_REQUIRED`/`REGISTRATION_REQUIRED` en 409 antes de demostrar el buzón, pese al 202 uniforme descrito | Un implementador puede exponer elegibilidad o estado de cuenta | Respuestas compartidas EmailRequest403/409 excluyen esos códigos en ambas solicitudes; 409 queda en ATTEMPT_CONSUMED; tasa de destinatario continúa oculta tras 202 |
| Q03 / Media | GET perfil/404 referenciaba NotFound con ErrorEnvelope genérico; aceptaba details con otra dirección de correo | Contradice details=[] y permite divulgación en una forma contractual válida | NotFound conserva su nombre y usa las mismas restricciones que Auth404; ErrorEnvelope original permanece intacto |
| Q04 / Media | PUT usuarios/{userId} enumeraba 404 en x-error-codes sin response 404 y omitía Origin/header web exigidos en el alias nuevo | Generación de clientes incompleta y controles distintos para el mismo cambio de perfil | Añadidos Auth404 y parámetros Origin/WebClient en PUT legado; conservados DTO, ruta, bearer y propiedad |
| Q05 / Alta | El complemento de buzón del login Google mencionaba mismo intento, pero no fijaba explícitamente destinatario al email de la evidencia Google; el request acepta un email | Ambigüedad que permitiría implementar prueba de un buzón diferente para la identidad retenida | Identidad §3 y descripciones OpenAPI fijan email, issuer/sub, intento y propósito; email distinto conserva 202 sin envío/cambio. Es aclaración del vínculo existente, no aprobación de otro mecanismo |
| Q06 / Media | La suite solo comprobaba forma de ejemplos; omitía semántica en SessionResponse. Cinco esquemas de éxito carecían de caso positivo, afectando nueve respuestas | Contratos de éxito imposibles o sesiones vencidas podían escapar a la comprobación de ejemplos | Validador semántico común para las tres formas de sesión, casos positivos/negativos para los cinco esquemas, cobertura de cada respuesta de éxito JSON y límites adyacentes |

Los cinco esquemas sin caso positivo eran MailboxVerificationRequired,
EmailAccepted, ProofGrant, IdentityMetadata y MethodsResponse. Se añadieron diez
fixtures, un positivo y un negativo concreto por esquema; no se añadió un test
por fixture. Se añadieron tres métodos de prueba y se reforzaron los existentes.
Los vectores temporales agregan el instante posterior a cada límite sin borrar
los casos anteriores. El contraste entre oráculo semántico y Schema conserva los
negativos que son formalmente válidos pero temporalmente inválidos.

**Verificado:** las regresiones nuevas fallaron con las respuestas originales:
los dos métodos nuevos de errores/perfil detectaron códigos indebidos y el 404
sin respuesta. La comprobación de éxitos detectó nueve respuestas sin caso
positivo antes de añadir fixtures. Los errores quedaron corregidos sin desactivar
reglas Redocly ni relajar esquemas. No quedan defectos documentales demostrados
que impidan someter este borrador explícitamente Proposed a revisión.

## 4. Revisión de seguridad por superficie

| Superficie | Coherencia comprobada | Límite y riesgo restante |
|---|---|---|
| Google | Firma/algoritmo, issuer validado/canonicalizado, audience del cliente fijado en intento, azp, tiempos, nonce de servidor y consumo único; mapping issuer/sub interno; complemento de buzón ahora ligado explícitamente | Perfil exacto y prueba de interacción reciente aún B04/B05. No se ejecutó GIS ni verificación criptográfica |
| Correo | Secreto efímero de un solo uso, verificador hash, TTL acotado al intento, consumo atómico descrito, GET/HEAD inocuos y POST explícito con cookie/CSRF; reenvío invalida anterior sin prolongar intento; acuse no enumera | Atomicidad, escáner que ejecute JS, tasas, tiempos comparables y entrega requieren pruebas de implementación; continuidad/alta/perfil inicial siguen B02 |
| Sesión | Mínimo de ventana/inactividad/absoluto, igualdad expira; refresh no reinicia absoluto ni cuenta como actividad; rotación/reuso y carreras documentados; logout 204 solo confirma estado en ms-users | B01/B03/B06 impiden afirmar cumplimiento distribuido, actividad humana o UX concurrente |
| JWT/JWKS | Perfil candidato con allowlist, iss/aud/sub/sid/iat/exp/jti, nbf si existe, kid/typ y solo públicas; rechazo de Google como bearer interno, none/HMAC, URLs de claves del token y confianza indefinida | Schema no autentica emisor ni distingue namespace de sub; RSA real, duplicados kid, semántica temporal de claims, rotación/cachés y compromiso requieren B05 y pruebas runtime |
| Perfil | userId opaco, propietario comparado con principal, alias sin colisión, sin escritura de correo/rol/estado y sin privilegios por dominio | Futuro adaptador debe aplicar ownership antes de revelar existencia; no se probó servidor remoto |
| APIM/navegador | Metadata sin bootstrap JWT; rutas pre-sesión y cookie separadas de proofs protegidas; JWT+cookie+CSRF en seguridad conjunta, no OR; no wildcard auth; cookies no se propagan a negocio; origen gateway autenticado | Hosts, SameSite, CORS/CSRF, desafío cookie, backend directo y políticas efectivas no determinados; B05/B06 |
| Integración | Angular necesita intercambio/nonce, sesión interna, ID propio, cookies/CSRF, refresh serializado y manejo de errores; otros servicios revalidan y autorizan sin consultar DB ajena ni ms-users por request | No hay integración dinámica con Java/Node/Python/APIM; repositorio independiente y versión canónica requieren B07 |

La guía primaria de [verificación Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
confirma que email_verified puede no acreditar propiedad actual de un buzón de
terceros; no se toma hd del botón como prueba. La
[RFC 9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14)
explica el coste de revocar la generación activa al detectar reuso; esto sustenta
el riesgo de carreras documentado, sin declarar OAuth implementado. Microsoft
requiere metadata OpenID conforme para
[APIM openid-config](https://learn.microsoft.com/en-us/azure/api-management/validate-jwt-policy)
y documenta cachés que no equivalen a invalidación inmediata. Se revisaron estas
fuentes primarias; no son evidencia de la configuración real del proyecto.

## 5. Revisión B01–B07

Se conserva la identificación de la matriz original. Ninguno se cierra por pasar
pruebas de forma; las correcciones Q01–Q06 eliminan defectos del borrador y no
sustituyen acuerdos de seguridad.

| Bloqueo / severidad | Evidencia y riesgo real | Alternativa recomendada para revisión | Decisión humana pendiente | ¿Bloquea publicación documental? / ¿implementación? |
|---|---|---|---|---|
| B01 / Crítica | x-session-policy.enforcementStrategy=unresolved-B01; identidad §4. JWT firmado no observa logout/revocación posterior; leeway puede superar deadline | Evaluar A+B bajo residual explícito y límites estrictos de expiración, según análisis siguiente; si se exige cero residual mantener bloqueo | RP/SEG/APIM/servicios: instante de corte, residual de revocación, relojes, particiones e in-flight; mecanismo y evidencia | No, como Proposed / Sí, garantías de sesión y acceso distribuidas |
| B02 / Alta | Identidad §2/3: buzón reasignado solo prueba posesión actual; nombre/perfil inicial email no resuelto | Fail-closed con CONTINUITY_REQUIRED tras prueba válida para cuenta histórica; diseñar continuidad independiente y alta coherente, sin inventar afiliación | Funcional/ms-users/SEG/RP: prueba estable, recuperación, namespace EmailIdentity, datos iniciales y casos de conflicto | No / Sí, acceso histórico, alta/recuperación email completas |
| B03 / Alta | ActivityRequest y operación activity se declaran condicionales; JS/interactionId no acreditan humanidad | No habilitar señal de actividad hasta definir reconocimiento verificable en servidor y distinguir sondeos; si no es demostrable, revisar el mecanismo con sus dueños | ms-users/frontend/APIM/SEG: señales admitidas, deduplicación, coordinación y validación adversarial | No / Sí, actividad y renovación dependientes de esa señal |
| B04 / Alta | ProofGrant y proofs: nonce/iat reciente no demuestra interacción reciente; ambas pruebas ligadas a sid/usuario/identidad | Evidencia de autenticación interactiva suficiente por método, con expiración y consumo ligados; conservar bloqueo de link/logout all hasta acordarla | ms-users/frontend/funcional/SEG: evidencia de frescura, reloj, antigüedad máxima y tratamiento de GIS silencioso | No / Sí, vínculo y operaciones sensibles |
| B05 / Alta | Claims/principal Proposed; metadata propia no OIDC; RS256, iss/aud, claves/cachés pendientes | Un perfil interoperable acordado y probado en todos los validadores; APIM con aprovisionamiento público controlado o discovery conforme aprobado, sin inventar endpoints OAuth | ms-users/APIM/consumidores/SEG/RP: algoritmo/tamaño/typ/claims, entornos, skew, rotación normal/emergencia, cachés y custodia | No / Sí, emisión/validación e integración JWT/JWKS |
| B06 / Alta | Cookies __Host-*, CSRF, Origin, rutas cookie sin access previo y rotación estricta están propuestas; topología real desconocida | Revisar topología same-site y cookie HttpOnly/Secure con CSRF/CORS exactos; serializar refresh y ensayar pérdida/carreras/dispositivos sin rebajar controles | frontend/ms-users/APIM/SEG: hosts/SameSite/ámbitos, desafío 401, TTL/tasas, aviso UX, navegadores y cross-device | No / Sí, flujos web seguros y sesiones integradas |
| B07 / Alta | x-design-review y Jira no acreditan conformidades; Angular actual no consume el flujo; autoridad/corte del repo independiente sin aprobar | Revisión conjunta por interfaz, versión/artefacto canónico y plan de corte; comprobar consumidores antes de servir incompatibilidades | RP/servicios/frontend/APIM/SEG: responsables con conformidad explícita, versión/corte y validación interoperable | No, para revisión / Sí, aprobación e implementación interoperable |

### B01: alternativas y recomendación técnica concreta, todavía Proposed

La aritmética Accepted es coherente: window=min(r+3600,a+28800),
inactivity=min(h+1800,a+28800), absoluto=a+28800; el primer límite termina la
sesión y en igualdad ya no puede renovarse. Los casos prueban esa especificación,
no una implementación. Si la actividad reconocida solo extiende plazos válidos,
exp acotado a los deadlines conocidos al emitir puede preservar sus límites
fijos. No permite observar una revocación ocurrida después de emitir.

| Alternativa del informe original | Garantía posible y coste |
|---|---|
| A: JWT breve, exp acotado al mínimo conocido | Validación local y menor dependencia; logout conserva vigencia restante. El TTL de 900 s sigue candidato, no SLA aprobado |
| B: revocaciones/versiones en proyecciones locales autenticadas | Respeta ownership y evita consulta a ms-users por petición; retardo/pérdida/partición requieren frescura demostrable, recuperación y fail-closed o residual aceptado. Difusión eventual no es corte inmediato |
| C: autoridad/estado de sesión vigente en admisión | Puede coordinar el corte si existe autoridad suficiente, origen protegido y rechazo cuando no se puede verificar estado; añade dependencia de disponibilidad y requiere revisión formal de frontera, consistencia e in-flight. No autoriza consultar ms-users por cada request |
| D: atestación de sesión muy breve junto al JWT | Acota una concesión temporal adicional; conserva residual hasta vencimiento y añade credencial/protocolo. Por sí sola no resuelve revocación inmediata |

**Recomendación para someter a aprobación:** utilizar el acotamiento de exp de A
como requisito temporal de cualquier propuesta y evaluar A+B como candidato de
revocación solamente si RP/SEG aceptan un retardo máximo explícito. Exigir
proyecciones con frescura verificable, rechazo al perderla, mensajes autenticados,
recuperación ante pérdida/reorden y pruebas simultáneas en APIM y cada backend.
No seleccionar almacenamiento, broker, SLA ni TTL en esta auditoría. A sola no
resuelve revocación; D añade coste sin resolver la garantía estricta.

Si el requisito humano es revocación inmediata sin aceptación posterior, A+B
asíncrona no basta. Mantener B01 abierto y evaluar la autoridad/barrera de C con
revisión formal de la frontera Accepted; ante partición habrá que rechazar cuando
no pueda demostrarse autorización vigente. También se debe acordar si el corte
se mide al admitir o completar la operación. No cambiar unilateralmente ADR-004.

Ejemplo de riesgo, no parámetro aprobado: aceptar exp+30 s tras acotar exp al
vencimiento de sesión todavía permite acceso 30 s tarde según el reloj del
validador. Eliminar esa extensión o demostrar una compensación segura de relojes
es condición de la garantía temporal. Revocar refresh, borrar cookies, añadir
sid/jti o retirar una clave de JWKS no invalida por sí solo los JWT ya confiados.

## 6. Validación reproducible y advertencias

Herramientas ya instaladas y fijadas: Redocly CLI 2.71.2, Node v24.14.0,
Python 3.15.0 en contracts/.venv, dependencias de requirements-validation.txt.
No se actualizaron dependencias ni locks. Desde la raíz del worktree:

```bash
npm --prefix contracts exec -- redocly lint contracts/openapi/users.json contracts/openapi/catalog.json contracts/openapi/notifications.json
contracts/.venv/bin/python -m unittest discover -s contracts/tests -p 'test_*.py' -v
git diff --check
```

| Verificación | Resultado y límite |
|---|---|
| Entrada de subfase 2 | 29/29 pruebas PASS; ocho warnings Redocly reproducidos antes de corregir |
| Suite final | 32/32 PASS: 12 pruebas originales y 20 de autenticación; tres métodos nuevos respecto de subfase 1 |
| Esquemas/referencias | 33 componentes Users válidos, referencias resolubles e IDs de operación únicos; sin aprobar perfil criptográfico |
| Respuestas/ejemplos | Cada respuesta de éxito JSON tiene caso positivo validado; cada operación/estado de error cruza códigos permitidos/prohibidos y rechazo de details privados |
| Tiempos | 13 vectores; antes/en/después de 30 min, 60 min y ocho horas, revocación y no reinicio absoluto; las tres formas SessionSnapshot/SessionResponse/AuthResponse aplican semántica |
| Regresión | Baseline anclado a git show; DTOs preservados y contratos/fixtures ajenos sin cambios |
| Redocly final | Cero errores; exactamente ocho advertencias, las mismas de la entrada |
| Whitespace | git diff --check y comprobación adicional de archivos nuevos, sin incidencias |
| GitHub Actions / Python 3.12 | No ejecutados. Workflow usa Python 3.12; no se localizó ese intérprete local. No se afirma equivalencia con Actions |
| Backend, navegadores, correo real y Azure/APIM | No ejecutados; no se certifican seguridad ni integración operativa |

| Advertencias | Respecto del commit base | Respecto de subfase 1 | ¿Bloqueantes? |
|---|---|---|---|
| Tres info-license, una por OpenAPI | Preexistentes; info sigue sin license | Sin cambio | No; no se inventa licencia |
| Tres operation-4xx-response en health | Preexistentes; health conservado | Sin cambio | No; estilo del endpoint técnico |
| Dos no-unused-components: InternalAccessClaims y AuthenticatedPrincipal | Nuevas en propuesta 0.2; Redocly no las cuenta como uso HTTP por sus x-extensions | Ya presentes; sin cambio en QA | No; no exponer principal/claims como DTO de entrada para ocultarlas |

El aviso de versión nueva del CLI es informativo, separado de las ocho
advertencias; se conservó la versión declarada. Durante la corrección se ajustó
la composición de restricciones para que el linter y JSON Schema validaran los
mismos ejemplos, sin suprimir reglas ni conservar warnings adicionales.

### Calidad y límites de las pruebas

Los checks originales de hashes, privacidad JWKS, requeridos, no bootstrap bearer,
seguridad conjunta y negativos de sesión sí detectan regresiones concretas.
La igualdad de dos usuarios sintéticos no prueba deduplicación de identidades;
las listas pollTimes/rotateTimes no ejecutan un servidor ni demuestran humanidad,
rotación o concurrencia. Las pruebas temporales son un oráculo de las invariantes,
no un sistema de sesiones. La auditoría no convierte fixtures en evidencia de
controles implementados. Faltan pruebas de firmas, claves reales de prueba,
issuer/audience, nonce/replay, consumo concurrente, continuidad, CSRF/CORS,
propagación de revocación y fallos de red cuando se autorice cada implementación.

## 7. Archivos, mantenimiento y estado Git

**Modificados durante QA:**

- contracts/identity/IDENTITY_CONTRACT.md.
- contracts/openapi/users.json.
- contracts/tests/test_auth_contracts.py.
- contracts/examples/auth/schema-cases.json.
- contracts/examples/auth/session-policy-cases.json.
- docs/MTEC15_AUTH_CONTRACT_REVIEW.md: solo aviso de resultados históricos y enlace
  al QA; se conserva el cuerpo y la evidencia anterior.

**Nuevo:** docs/MTEC15_AUTH_QA_REVIEW.md. El baseline de compatibilidad no cambió.

Estado final esperado y comprobado: dos archivos rastreados modificados y seis
nuevos sin seguimiento, todos locales; índice vacío, HEAD y rama conservados.
No se ejecutaron add, commit, push, PR, merge, rebase, reset, clean, switch ni
checkout. No se crearon ramas ni se alteraron otros worktrees. Los seis archivos
locales preexistentes en main OneDrive conservaron sus hashes y su estado Git.
No se modificaron ADR, catálogo, notificaciones, backend, Angular, workflows,
locks, Jira ni Azure/APIM.

Se revisó la matriz de [UPDATE_PROTOCOL](../context/maintenance/UPDATE_PROTOCOL.md).
No se editó context/: no hay nuevo hecho de implementación ni decisión Accepted;
los desfases históricos ya identificados, incluida la frase «no hay OpenAPI» en
integración, siguen señalados sin ampliar el alcance autorizado. Este informe
registra evidencia y acciones pendientes de una auditoría técnica; no memoria
conversacional ni una segunda fuente contractual.

## 8. Recomendación para revisión humana y subfase 3

Preparar la publicación documental del borrador corregido cuando se autorice,
con ambos dictámenes visibles. Mantener B01–B07 y Proposed en las interfaces.
Priorizar garantía/residual B01, continuidad B02, señales B03 y frescura B04;
coordinar B05/B06 con consumidores y B07 con la versión/artefacto autoritativos.
Registrar acuerdos o desacuerdos de responsables pertinentes sin inferirlos por
lint, CI, assignment o merge. Ejecutar el workflow en Python 3.12 cuando se
publique la revisión. Esta auditoría no inicia publicación ni la siguiente subfase.

**MTEC-15 — Subfase 2 auditada. Contratos sujetos a revisión humana y acuerdos de seguridad pendientes.**
