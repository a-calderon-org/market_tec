# MTEC-15 — Revisión candidata de autenticación y conformidades B07

**Fecha:** 2026-11-02 (America/Costa_Rica). **Destinatarios:** mantenedores de
ms-users, Angular, ms-catalog, ms-notifications, APIM y revisión de seguridad.
**Candidata:** `0.3.0-draft`. **QA contractual:** PASS WITH NOTES.
**Aprobación de interfaces/integración:** BLOCKED por decisiones, protocolos y B07.

## Alcance y metodología

Consolidación de decisiones, actualización de identidad/Users OpenAPI, fixtures,
QA contractual y preparación de entrega. Base: `origin/main@c5dc74ffbe66d1d800972ad11402d8ac9becc3d9`,
actualizada mediante fetch, rama `feat/mtec15-auth-contract-consolidation`, worktree
`~/Developer/MarketTec/worktrees/market-tec-mtec15-contract-consolidation` inicialmente limpio.
Lectura dirigida de ADR-004, DECISION_LOG, contratos/tests, consumidores Angular,
informes locales siguientes y tickets en modo de solo lectura. Sin autenticación
de aplicación, Java/Angular, repositorio independiente, Azure/APIM ni despliegues.

**Verificado:** [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40)
registra aprobaciones posteriores B01–B06 (descripción actualizada 2026-11-02
20:32:45 -06:00); [MTEC-15](https://allanaron06122005.atlassian.net/browse/MTEC-15)
sigue In Progress y [MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36)
To Do. No se actualizaron tickets. MTEC-36 conserva texto antiguo de 15 min y
request `{credential}`; prevalecen decisiones posteriores MTEC-40 y el contrato
candidato para revisión, sin tratar ese desfase como aprobación de interfaces.

Los tres informes se leyeron directamente, incluidos archivos sin seguimiento;
no existen en la base como evidencia publicada. Huellas SHA-256 de la lectura:

| Worktree fuente / archivo | SHA-256 |
|---|---|
| `market-tec-mtec40-b01/docs/MTEC40_B01_SESSION_REVOCATION_REVIEW.md` (§12–14) | `8abe31593135579ac4182644f49307b181d4f5aea5ab65d697d170a11ae3dda5` |
| `market-tec-mtec40-b02-b04/docs/MTEC40_B02_B04_DECISIONS.md` (B02–B04) | `966eaadfc56f2542f78b6ec52c3f24680c2697451b8f529798b17cb580066132` |
| `market-tec-mtec40-b05-b06/docs/MTEC40_B05_B06_SECURITY_PROFILE.md` (§2–7) | `e040aa8502969325bc3470539df378b37be9e3f589476a76637367b29901d296` |

Las cabeceras Proposed de B02/B05/B06 preceden a las aprobaciones Jira. Se
consolida únicamente el alcance aprobado, sin adoptar sus parámetros candidatos.
La matriz canónica de aprobaciones/pendientes está en [ADR-004 §3.4.1](../context/decisions/ADR-004-seguridad-autenticacion.md#341-consolidación-de-aprobaciones-y-pendientes--2026-11-02).
No se duplican propuestas completas ni se atribuyen conformidades a equipos.

## Cambios y compatibilidad frente a 0.2.0-draft

| Superficie | Cambio / impacto |
|---|---|
| JWT | Candidato 900 s sustituido por máximo nominal 240 s; RS256/RSA-2048, sub=userId, sid y kid en JOSE; validación estricta y cero leeway positivo. Incompatible con emisores/validadores que mantengan 900 s, otra clave/perfil o tolerancia positiva |
| Metadata | `contract_version` cambia a const `0.3.0-draft`; incompatible con validadores que fijen 0.2.0. Header JOSE y extensiones de política son aditivos |
| Sesión | Se conservan 60/30/8, igualdad expira y primer deadline. exp acotado con margen medido, no inventado; residual ordinario ≤300 s requerido, sin demostración |
| Identidad | B02 passkey por userId/código de un uso, opcionales para básico; sin merge ni transferencia de historial. Sin endpoints WebAuthn/recuperación ni protocolo de alta aislada inventados |
| Actividad | B03 usa ejecución real respaldada por servidor, cómputo único y procesamiento ≤60 s sin reactivación; request actual no basta y permanece bloqueado |
| Navegador | Access/CSRF solo memoria, refresh opaco cookie HttpOnly/Secure/host-only, sincronizador/CORS explícito y serialización entre pestañas sin gracia general. Protocolo, SameSite/Path/hosts pendientes |
| Refresh/logout/aviso | Bloqueo de emisión tras revocación, carreras/duplicados/pérdida explícitos. Detalle Draft de revocar familia ante reuso y reautenticar tras pérdida; pruebas pendientes. Aviso candidato 300 s antes del deadline de sesión, nunca del JWT |
| Regresión | Mismas 21 operaciones: health implementada, 20 propuestas. Perfil/DTOs existentes, eventos, Catalog y Notifications conservados; baseline de hashes pasa |

**Verificado estáticamente:** Angular todavía deriva `id` de Google `sub`
(`google-auth.service.ts`), guarda token en sessionStorage (`auth-token.service.ts`)
y no consume este flujo de sesión/refresh. Requiere migración coordinada. Los
OpenAPI Catalog/Notifications aceptan bearer interno en diseño; sus descripciones
no prueban verificación efectiva. Las fundaciones locales carecen de autenticador.
No se inspeccionó ni modificó el repositorio independiente de ms-users en esta revisión.
No consta compatibilidad dinámica ni conformidad de ningún consumidor.

## Entrega por grado de preparación

**LISTO PARA DESARROLLAR CON CONTRATO ESTABLE**

- `GET /health`: contrato conservado y ya implementado en la fundación.
- Formas existentes de perfil (`UserProfileV1`, `UpdateUserRequest`,
  `UpdateUserResponseV1`), envelope de error e IDs opacos: DTOs, mocks y adaptación
  de dominio sin acceso autenticado real. Ownership/principal interno tienen
  dirección aceptada; esto no habilita sus adaptadores HTTP protegidos.
- Angular/otros servicios pueden preparar mocks, consumo opaco de userId y
  autorización de recursos propios en aislamiento. No se inicia trabajo aquí.

**IMPLEMENTACIÓN CONDICIONADA**

| Endpoints existentes en Draft | Condición antes de implementación interoperable |
|---|---|
| `POST /v1/auth/attempts`, `/v1/auth/google`, `/v1/auth/email/requests`, `/v1/auth/email/confirm` | Aprobar protocolos Google/enlace, alta/perfil inicial/continuidad aplicable, intentos, TTL/tasas/anti-replay y B07; probar elegibilidad y no enumeración |
| `GET /v1/auth/session`, `POST /v1/auth/refresh`, logout `scope=current` | Cerrar CSRF/refresh/concurrencia/pérdida y topología; estado/tiempo autoritativos y emisión/revocación ordenadas; D4/D5 aplicables y B07. Snapshot/aviso y tests navegador pendientes |
| `GET /.well-known/jwks.json`, `GET /.well-known/markettec-identity` | Cerrar issuer/audience/configuración, custodia local, procedimiento de públicas/caché/frescura/rotación y B07. Aprovisionamiento APIM/pruebas antes de integrar; no metadata custom como discovery OIDC |
| `GET/PUT /v1/usuarios/{userId}`, `GET/PUT /v1/me/profile`, `GET /v1/me/auth-methods` | Adaptador de principal/JWT, ownership, reglas por operación y contratos B07; ejecución protegida depende del perfil/validador revisado |

No hay un endpoint nuevo de autenticación listo para integración final solo por
pasar este QA. Los módulos aislados no prueban las garantías distribuidas.

**BLOQUEADO**

- `POST /v1/auth/session/activity`: falta contrato verificable de evidencia,
  productor, allowlist y deduplicación; `{interactionId,kind}` no es evidencia.
- `/v1/auth/proofs/*`, `POST /v1/me/auth-methods`, logout `scope=all` y efectos
  sensibles: B04 requiere evidencia reciente ligada a acción/usuario/sid y
  consumo único; <300 s aún condicionado; resolver D4/D5 aplicables.
- Passkeys/códigos, recuperación excepcional, alta aislada y recuperación de
  historial: política B02 aprobada, protocolos/contratos no disponibles. No
  inventar rutas ni exigir continuidad como requisito para básico.
- Corte de operaciones/entregas en vuelo y contención crítica: B01 D4/D5 siguen
  Proposed; no aprobar por inferencia A+B local, Redis, broker ni topología.

## Checklist B07 de conformidades

Cada conformidad debe identificar persona/rol autorizado, versión/commit/diff,
fecha, evidencia y desacuerdos/condiciones. Ninguna casilla está acreditada por
esta revisión; aprobar política RP no equivale a conformidad de consumidor.

- [ ] **ms-users:** consumir una versión canónica de `market_tec`, aprobar
  requests/responses/errores y alta/continuidad; verificar perfil, deadlines,
  orden emisión/refresh/logout, replay/concurrencia, JWKS y pruebas negativas.
  Acordar autoridad/corte del repositorio independiente sin duplicar contratos.
- [ ] **Angular:** revisar Google/enlace/CSRF, memoria/cookies/withCredentials por
  destino, serialización entre pestañas, 401/403/503 sin bucles, respuestas tardías,
  aviso de sesión, recarga/pérdida/logout y migración de Google sub a userId.
- [ ] **APIM:** aprobar tabla exacta método/ruta pública/protegida, perfil y claves
  públicas, CORS/preflight, redacción/saneamiento/cookies, sin ciclo de arranque;
  demostrar relojes, caché/propagación/retirada y contención sin bypass al integrar.
- [ ] **ms-catalog / ms-notifications:** conformidad individual; validar JWT
  defensivamente, userId opaco y ownership/participación/destinatario; rechazar
  firma/alg/iss/aud/tiempos erróneos, sin confianza en headers cliente ni lookup
  a ms-users por request. Acordar compatibilidad y delegación si corresponde.
- [ ] **SEG y RP:** resolver D4/D5 y B04; aprobar protocolos B02/B03/B06,
  parámetros mínimos y excepciones/riesgos con responsable e hito; no sustituir
  pruebas por declaraciones. Acordar versión/corte y aprobación final MTEC-15.

## Evidencia reproducible de QA y límites

**Verificado:** suite local **37/37 PASS**, incluidos 27 vectores JWT sintéticos,
formas/referencias/ejemplos Schema 2020-12, bordes 60/30/8 antes/en/después,
refresh/logout/errores, política sin merge por email y baseline de compatibilidad.
Oráculo aislado en `test_jwt_profile.py`: OpenSSL verifica firmas; se rechazan
algoritmo, firma/clave ajena, issuer/aud incorrectos, kid ausente/desconocido,
claims/tipos, vida >240 s y exp en igualdad/después. No se importa desde servicios.
Privadas efímeras descartadas; fixtures solo públicas/tokens para `.invalid`.

**Verificado:** Redocly 2.71.2 valida los tres OpenAPI sin errores, **9 warnings**:
6 previos de license/health, 2 previos de claims/principal auxiliares y 1 nuevo
de header JOSE auxiliar usado por extensión/tests, no como cuerpo HTTP.
`git diff --check` y whitespace de archivos nuevos: sin errores.

Comandos desde el worktree (tras instalar herramientas fijadas según contracts/README):

```bash
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s contracts/tests -p 'test_*.py' -v
npm --prefix contracts exec -- redocly lint contracts/openapi/users.json contracts/openapi/catalog.json contracts/openapi/notifications.json
git diff --check
```

Se reutilizaron en lectura las herramientas ya instaladas del worktree
`market-tec-mtec15-auth-contracts/contracts`: su `.venv/bin/python` y ejecución
directa de `node_modules/@redocly/cli/bin/cli.js` con Node. Versiones Python de
dependencias coinciden con requirements-validation.txt; no se alteraron lockfiles.
OpenSSL local 4.1.0. El oráculo exige OpenSSL en PATH y falla si falta; CI Ubuntu
debe confirmar disponibilidad y reejecutar la candidata tras publicación autorizada.

**Documentado pero no verificado:** rechazo real en Java/Node/Python/APIM;
residual ≤300 s, margen/relojes, emisión/revocación concurrentes, recuperación
ante pérdidas/particiones, caché/rotación/contención, cookies/CSRF/CORS reales,
WebAuthn/códigos, actividad y frescura real Google/complemento. No hubo pruebas
de integración, navegador, Azure ni CI remoto de esta candidata local.
**No determinado:** topología/hosts, parámetros exactos y capacidades desplegadas.
**Inferido:** viabilidad del margen temporal; las ecuaciones y el TTL no lo prueban.

## Decisiones, riesgos y salida de MTEC-15

Falta aprobación RP de D4 (corte/entregas/efecto sensible) y D5 (infraestructura y
contención crítica), y ratificación técnica B04 por método/acción. Protocolos
WebAuthn/recuperación, alta aislada/perfil inicial, actividad y CSRF/refresh/aviso,
issuer/aud y procedimientos de claves deben cerrarse con sus responsables. No
se reabre la política ya aprobada RS256/RSA-2048, 240 s, 60/30/8 ni básico B02.

Riesgos: bearer reutilizable durante residual permitido; reloj/caché o carreras
sin demostrar; exclusión conservadora ante pérdida de evidencia; cambios
incompatibles en consumidores; no existe prueba de revocación crítica por TTL.
No habilitar superficies dependientes de decisiones pendientes.

Para MTEC-15 Done: registrar revisiones/conformidades conjuntas de consumidores
y SEG/APIM, resolver o diferir explícitamente pendientes sin dejar ambiguas las
interfaces aprobadas, acordar consumo/versionado/corte, publicar tras revisión
autorizada y ejecutar CI sobre la candidata, con pruebas por endpoint al
implementar adaptadores. No se exige certificar producción Azure dentro de este
QA contractual; no puede usarse su ausencia para afirmar controles desplegados.

Según UPDATE_PROTOCOL, `context/` se limita a ADR-004/DECISION_LOG porque cambian
decisiones y referencias contractuales; arquitectura/integración/deuda describen
implementación que no cambió. Los informes anteriores siguen históricos. Estado histórico al preparar esta evidencia de prepublicación: cambios locales
sin staging, commit, push ni PR. La publicación y el CI posteriores se verifican
en el PR correspondiente; no se deducen de este QA local. Main OneDrive y
B01/B02–B04/B05–B06 preservados mediante contraste de HEAD, estados y huellas
antes/después.

**Contrato todavía Draft. B07 preparado, sin conformidades ni aprobación final.**
