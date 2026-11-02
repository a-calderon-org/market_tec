# MTEC-40 — QA independiente de ADR-004

Fecha: **2026-11-01**, America/Costa_Rica. Destinatarios: mantenedores,
responsable del proyecto y revisores técnicos/funcionales de MTEC-40.
Este informe es una auditoría técnica; no es un ADR ni un contrato.

**QA técnico-documental: QA PASS WITH NOTES**, después de las correcciones de F.
**Aprobación arquitectónica: PENDING HUMAN APPROVAL.** ADR-004 sigue Proposed.

## Alcance, método y límites

Se leyeron íntegramente el diff recibido, [ADR-001](../context/decisions/ADR-001-distribucion-microservicios.md),
[ADR-004](../context/decisions/ADR-004-seguridad-autenticacion.md),
[DECISION_LOG](../context/decisions/DECISION_LOG.md),
[IDENTITY_CONTRACT](../contracts/identity/IDENTITY_CONTRACT.md) y
[Users OpenAPI](../contracts/openapi/users.json). Se contrastaron código Angular,
fundaciones de servicios, ms-users independiente, prosa relacionada y validadores.
Se siguieron AGENTS.md, context/README.md y UPDATE_PROTOCOL.md.

**Verificado:** lectura de Jira MTEC-12/15/34/35/36/37/40 y comentarios de
34/35/37/40; Git/GitHub; inspección estática y validaciones de E.
**Inferido:** evaluación de riesgos y suficiencia para deliberación humana.
**Documentado pero no verificado:** selección B ampliada atribuida al responsable
en la documentación recibida; recuentos de pruebas ms-users y controles futuros.
**No determinado:** Azure efectivo, personas aprobadoras, dominios admitidos
y acta de autoridad/corte operativo.

No se ejecutaron ataques, login real, entrega de correo ni operaciones Azure.
No se reejecutaron pruebas Maven/SQL ms-users; success del CI no certifica sus logs.
Merge, ticket Done y QA satisfactorio no equivalen a aprobación arquitectónica.

## A. Estado Git

| Dato | Evidencia verificada |
|---|---|
| Worktree exclusivo | `/Users/allanaron06122005gmail.com/Developer/MarketTec/worktrees/market-tec-mtec40` |
| Rama | `docs/mtec40-adr004-formal-review` |
| HEAD/base | `de6192b4df8f75df1f58ad07b9c03710b2cc91c1` |
| origin/main local y main remoto | Mismo SHA; remoto confirmado con git ls-remote |
| Entrada | ADR-004 y DECISION_LOG modificados, sin archivos nuevos |
| Diff de entrada | 2 archivos; 162 inserciones, 60 eliminaciones |
| Staging entrada/salida | Vacío, índice sin modificar |
| Salida | Dos documentos modificados y este informe nuevo sin seguimiento |
| Diff final | `2 documentos rastreados: 174 inserciones, 64 eliminaciones`; informe nuevo aparte: `515` líneas |

Se ejecutaron `pwd`, `git rev-parse --show-toplevel`, `git remote -v`,
`git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`,
`git status -sb`, `git status --short --untracked-files=all`,
`git worktree list --porcelain`, `git diff --check` y `git diff --stat`.
No hay divergencia relevante con main. No hubo fetch, integración, otro worktree,
staging, commit, push o PR. Código, configuración y contratos no cambiaron.

Se preservaron copias iniciales, `initial.diff` y diffs del QA fuera del repo en
`/private/tmp/mtec40-qa-subfase2/`. Huellas de entrada:

| Archivo | SHA-256 |
|---|---|
| ADR-004 | `558862547250aefbdc7f3153617ff595dacbfe2daae276fa5b294890398721d9` |
| DECISION_LOG | `5b9aa343f1ee5b0db43c4e15925655c226b93eb7e022e3df276db567474652bd` |

El delta QA frente a la entrada es 24 inserciones/18 eliminaciones en ADR-004
y 4/2 en DECISION_LOG; son ajustes sobre el trabajo recibido, no su reemplazo.
F conserva el manifiesto durable de correcciones; las copias temporales son
auxiliares y no se versionan como memoria conversacional.

## B. Matriz de decisiones auditadas

**A:** antes de implementar MTEC-36 interoperablemente. **B:** antes de integrar
Angular/consumidores. **C:** antes de desplegar protegido en Azure. **D:** detalle
diferible con rol e hito propuestos. Son acumulativas. En ADR corresponden a
I/F/D: su hito D significa despliegue, no el diferimiento D de este informe.

Para **cada fila** se contrastaron nueve criterios: coherencia con ADR-001,
alternativas, justificación, riesgos, parámetros definidos o abiertos, aprobador,
prueba verificable, dependencia temporal y ausencia de aprobación atribuida.
Tras las correcciones, los nueve están suficientemente descritos para deliberar;
eso no resuelve sus parámetros abiertos. Todas siguen **Proposed**, con revisión
nominal pendiente. P05 conserva solo el principio opaco Accepted por ADR-001.
Las alternativas/valores completos siguen siendo canónicos en ADR-004 §4.

RP: responsable del proyecto; SEG: seguridad a designar; U/C/N: responsables de
users/catalog/notifications; FE: frontend; INF: APIM/infraestructura.

| Decisión | Hitos | Juicio independiente, riesgo y recomendación | Revisores pendientes | Prueba verificable |
|---|---|---|---|---|
| P01 Estrategia | A/B/C | B ampliada respeta ownership; ratificar capacidad de operar emisor/correo | RP, U/C/N, FE, INF, SEG | Ambos métodos y vínculo legítimo conservan userId; correo sin Google |
| P02 Algoritmo | A/B/C; D tamaño custodio | RS256 frente a ES/HMAC razonado; 2048/3072 son candidatos | RP, U, INF, SEG | Java/Node/Python/APIM aceptan RS y rechazan none/HS/clave ajena |
| P03 Issuer | A regla; B/C valor | Exacto por entorno; fixture .invalid no acredita infraestructura | RP, U, INF, C/N | Emisor de otro entorno/sufijo rechazado |
| P04 Audience | A semántica; B/C valor | Aud común simplifica pero permite reutilización; ownership obligatorio | RP, U/C/N, INF, SEG | aud ajena/ausente y recurso ajeno denegados |
| P05 Sub/userId | A/B/C | Opacidad conforme ADR-001; no deduplicación personal por correo ni UUID impuesto al consumidor | RP, U/C/N, MTEC-15 | Concurrencia/cambio de correo conservan mapping/userId |
| P06 Iat | A/B/C | Segundos/tipo/futuro definidos como propuesta; no equivale a auth_time | RP, U/C/N, INF | Futuro, milisegundos y tipo incorrecto rechazados |
| P07 Nbf | A/B/C | Omitir o exigir son alternativas reales; si existe, validar homogéneamente | RP, U/C/N, INF | Ausente según perfil; futuro/incoherente rechazado |
| P08 Exp | A/B/C | Obligatorio/máximo acotado; coordinar residual con P10/P15 | RP, U/C/N, INF | Ausente, exp≤iat, exceso de duración y bordes de skew |
| P09 Jti | A/B/C; D retención | UUIDv4 candidato; no evita replay ni revoca por sí solo | RP, U, SEG | Generación/unicidad y replay residual demostrado |
| P10 Acceso/sesión | A/B/C | TTL razonados; aclarado que sesión expirada no corta todo JWT; falta acordar exp final | RP, U, FE, SEG | Absoluta/inactividad, último refresh, carrera y respuesta perdida |
| P11 Skew | A perfil; B/C medición | 30 s candidato; 930 s nominal no es SLA sin medir relojes | RP, INF, U/C/N | Bordes ±skew y desfase real |
| P12 JWKS/tipo | A perfil; B publicación; C evidencia | Metadata/JWKS distintos; destinos fijos/kid/typ; no OIDC completo ficticio | RP, U, INF, SEG | kid desconocido/duplicado, jku hostil, caída, sin privados |
| P13 Rotación | A concepto; B protocolo; C/D operación | No enteramente diferible; secuencia normal/emergencia guía implementación | RP, U, INF, SEG | Prepublicación, solapamiento, compromiso y cachés calientes |
| P14 Custodia | C/D; aislamiento local desde A | Key Vault/MI/SKU no bloquean fakes; selección productiva pendiente | RP, U, INF, SEG | Verificador no firma; fallo de custodio no emite; mínimos permisos |
| P15 Revocación | A semántica; B/C mecanismo | Residual explícito; sin introspección por request contra ADR-001 | RP, U/C/N, INF, SEG | Todos los validadores cumplen ventana y emergencia acordadas |
| P16 Alta/elegibilidad | A/B/C; D recuperación alternativa | Alto riesgo de buzón reasignado; excluir recuperación no basta para login histórico | RP, funcional, U, SEG | Titulares sucesivos, dominios exactos, no elegible, conflictos sin fusión |
| P17 Acceso directo | A frontera; B interfaz; C/D Azure | Corregido diferimiento total; JWT/origen confiable conceptuales ahora, mecanismo Azure después | RP, INF, U/C/N, SEG | Directo con JWT válido bloqueado; host/slot/origen falso |
| P18 Intentos/enlaces | A/B/C; D tasas globales | Nonce/consumo/navegador explícitos; definir prueba de reauth por método | RP, U, FE, MTEC-15, SEG | GET inocuo, nonce ajeno/replay, consumo concurrente, abuso/NAT |
| P19 Principal/headers | A identidad; B shape; C evidencia | Reenvío/revalidación correctos; adaptar principal local mínimo al conceptual | RP, INF, U/C/N, SEG | Headers/body no cambian actor ni ownership |
| P20 Autorización | B/C; D capacidades | Ownership ya Accepted no se vuelve a bloquear; capacidades antes de integrar | RP, U/C/N, SEG | Objetos propios/ajenos, participación, denegación sin efectos |
| P21 Google | A/B/C; D IDs hasta B | Corregidos azp de cliente ajeno y evidencia Workspace; firma sola no autoriza | RP, U, FE, SEG | aud/azp/iss/nonce y email_verified/hd inválidos rechazados |
| P22 Excepciones | A clases; B rutas; C políticas | Corregido diferimiento conceptual y ambigüedad refresh vencido | RP, INF, U, SEG | Access vencido+refresh vigente renueva; refresh vencido no; sin wildcard |
| P23 Navegador | A modo; B/C topología | HttpOnly/Secure/CSRF razonados; SameSite None no garantiza cookies de terceros | RP, FE, U, INF, SEG | Orígenes/CSRF/cookies, expiración y navegador ajeno |
| P24 Cuota/logs | C/D; higiene desde A | Clave SPA pública no acredita usuario; cuota no bloquea fakes; redacción desde desarrollo | RP, INF, FE, SEG | Clave sola rechazada; señuelos ausentes de logs |

Los 18 perfiles originales siguen siendo necesarios. P13/P17/P22 añaden partes
conceptuales A antes implícitas o mal diferidas: **21 decisiones tienen alguna
parte A**, sin exigir 21 cierres operativos completos. P14/P20/P24 no añaden una
votación inicial de infraestructura/capacidades/cuotas. No se rebajaron bloqueos
para facilitar aprobación ni se convirtió Azure en dependencia de fakes locales.

Detalles D: U+INF revisan cadencia/SLA/custodio antes de C; INF+servicios,
aislamiento antes de C; U/C/N, capacidades antes de B; INF+U+MTEC-15, rutas antes
de B y políticas antes de C; INF/FE, cuota/alertas/retención antes de C.
FE+U cierran client IDs/orígenes antes de B. Son hitos de revisión propuestos;
el acta humana debe fijar persona y fecha comprometida. Ningún aplazamiento
está aprobado y no se inventan fechas ni personas.

## C. Análisis de seguridad

### Google y contexto

**Verificado documentalmente:** propuesta de firma RS256, JWKS Google configurado,
Cache-Control, refresco limitado por kid, issuers exactos, audience del intento,
tiempos y nonce consumido atómicamente antes de emitir. Canonicalizar después de
validar evita duplicar mapping. Alta idempotente requiere transacción/unicidad;
coincidencia de email no vincula cuentas. La [guía Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
distingue autoridad Workspace de correo externo verificado anteriormente.

**Inferido:** token firmado para otro cliente/presentador/intento/propósito, o
Workspace no autorizado, es prueba auténtica en contexto equivocado. La corrección
propone aud única, azp exacto cuando exista, email_verified booleano verdadero y
hd de allowlist Workspace pendiente. Probar token Google en negocio, interno en
intercambio y nonce de vínculo usado para login o viceversa.
[OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
fundamenta revisar azp; iat/nonce no prueban autenticación interactiva reciente.
El flujo GIS concreto y la prueba reauth siguen pendientes, sin asumir soporte
de auth_time/max_age que no esté demostrado.

### Correo y continuidad de cuenta

**Verificado documentalmente:** dominios candidatos exactos sin habilitación;
posesión de buzón separada de elegibilidad académica. Propuesta: 256 bits,
SHA-256 de secreto aleatorio, TTL, estado/intento, consumo atómico, GET sin efectos,
POST protegido, no enumeración y límites de abuso. Mismo navegador propuesto;
cross-device excluido hasta protocolo aprobado. Los controles de [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
se adaptan a enlaces, sin atribuirle un protocolo de login completo.

**Inferido, riesgo alto:** un enlace nuevo no distingue titulares sucesivos del
buzón. Recuperar identidad existente contradecía la garantía frente a reasignación.
Se explicitó P16 bloqueante con alternativas abiertas y evidencia funcional;
no se eligió política ni almacenamiento. Vincular exige prueba reciente de ambos
métodos y conflictos sin fusión. Reauth 5 min requiere prueba/reloj por método;
cookie de sesión o callback silencioso no se declaran suficientes. El modelo
actual no garantiza unicidad por persona ni por correo entre métodos.

### JWT, sesiones, claves y revocación

**Verificado documentalmente:** RS256 único, sub opaco, iss/aud exactos,
iat/exp/jti requeridos, nbf opcional validado, kid/typ explícitos.
RSA ≥2048/3072, acceso 900 s, skew 30 s y sesión 8 h/30 min son candidatos;
issuer/audience/URLs definitivos siguen abiertos. [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html)
respalda separar perfiles/algoritmos y no seguir URLs del token.

Refresh opaco con verificador/familia, rotación estricta atómica y detección de
reutilización. Respuesta perdida exige reautenticar. Probar serialización también
entre pestañas. Logout actual/todas y baja revocan sesiones; **jti no revoca por
sí solo**. [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14)
orienta replay de refresh, sin certificar un servidor OAuth implementado.

Residual candidato hasta exp+skew, nominalmente 930 s desde iat, no desde logout
ni como SLA universal. Expirar sesión impide refresh pero no corta necesariamente
JWT emitido; falta limitar exp o aceptar residual. Clave comprometida permite
falsificar tiempos: retirar confianza en todos o suspender rutas, no esperar TTL.
[APIM documenta caché](https://learn.microsoft.com/en-us/azure/api-management/validate-jwt-policy)
de 1 h y recuperación limitada a 5 min, sujetos a cambio; borrar JWKS no acredita
revocación inmediata. Custodio/MI/SKU, cachés, solapamiento y runbook necesitan
evidencia antes de C. Claves locales efímeras no requieren esa selección productiva.

### Fronteras y autorización

Google acredita identidad externa; U resuelve identidad/emite; APIM admite;
backends revalidan; servicio dueño autoriza recursos. Headers del navegador no
acreditan identidad. JWT válido no demuestra origen APIM: el acceso directo debe
bloquearse incluso con bearer válido. No se consulta U por request ni bases ajenas.

Login/desafíos/correo usan prueba propia sin access previo; refresh exige sesión
vigente. Metadata/JWKS públicos deben ser alcanzables sin ciclo aunque el origen
backend esté aislado. Logout/vínculo requieren control de sesión/reauth/CSRF por
concretar en MTEC-15. 401 para credencial inválida y 403/404 de ocultación requieren
acuerdo por recurso. Nada acredita que APIM ya lo haga.

Cookies host-only HttpOnly/Secure, Path/SameSite explícitos, origen exacto y CSRF
ligado a intento/sesión son coherentes. CORS no autentica, HttpOnly no elimina XSS
y None+Secure no garantiza cookies de terceros. SWA/azure-api.net pueden ser
cross-site. [VNet Integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration)
requiere cómputo dedicado y resuelve salida. F1 no se declara apto ni se aprueba
comprar otro plan. Configuración efectiva y aislamiento Azure: No determinado.

## D. Contratos, repositorios y estado vigente

### Matriz de interfaces

Todas las ampliaciones son **Proposed** y requieren MTEC-15 antes de implementar
la interfaz afectada. No se cambió OpenAPI ni IDENTITY_CONTRACT. U es propietario
de operaciones/emisión; cada adaptador es propietario de su principal confiable.

| Interfaz | Documentada en ADR | OpenAPI actual | Dueño/consumidores | Prueba de compatibilidad pendiente |
|---|---|---|---|---|
| Google login | Sí, 3.1/8.1 | POST /v1/auth/google proposed | U; FE/APIM | Request cerrado solo credential no admite intento nuevo; revisar versión y respuestas 200/401 |
| Desafío/nonce | Sí | Ausente | U; FE/APIM | Cookie/propósito/cliente, emisión, consumo y replay |
| Solicitud institucional | Sí | Ausente | U; FE/APIM; entrega por designar | Acuse uniforme, reenvío y tasa/Retry-After sin enumeración |
| Confirmación | Sí | Ausente | U; FE/APIM | GET inocuo, POST/CSRF, intento, secreto y carrera/respuesta perdida |
| Refresh | Sí | Ausente | U; FE/APIM | Cookie/rotación/reuso/expiración; sin access previo obligatorio |
| Logout | Sí | Ausente | U; FE/APIM | Actual/todas, idempotencia, borrar cookie y residual |
| Vinculación/recuperación | Sí | Ausente | U; FE/funcional/SEG | Prueba de ambos métodos, frescura, conflicto/continuidad y exclusiones |
| JWKS | Sí | Ausente | U; APIM/U/C/N | Solo públicos, kid/alg/uso, caché/rotación/fallo |
| Metadata | Sí | Ausente | U; APIM/U/C/N | Issuer/jwks_uri configurados, discovery compatible sin ciclo |
| Principal | Sí, conceptual | Campos en IDENTITY_CONTRACT; no DTO OpenAPI | Adaptadores U/C/N | Local solo userId(); adaptar tokenId/issuedAt/expiresAt/scopes sin parsing del ID |
| Errores | Sí | Envelope; Google 200/401; GET perfil sin 401/403 | Cada servicio; FE/APIM | 400/401/403/404/409/429/temporal según acuerdo; no revelar cuenta ni token |
| Cookies/CSRF | Sí | Sin Set-Cookie/CSRF/CORS; AuthResponse solo token/tokenType/expiresAt/user | U con FE/APIM | Host/path/SameSite/orígenes/preauth; 401 y refresh sin bucles |

El principal local mínimo frente al conceptual es brecha de adaptación, no
evidencia de validación JWT. NumericDate JWT no aprueba ADR-003. Las ausencias
contractuales son bloqueantes para cada interfaz, aunque Redocly valide el draft.

### HEAD y transición de ms-users

**Verificado:** inspección local de solo lectura en
`/Users/allanaron06122005gmail.com/Developer/MarketTec/worktrees/ms-users-mtec37`.
Rama `recovery/mtec37-appservice-readiness`, HEAD `7f963a9`; main/origin/main
locales `650411b`. Limpio al inicio/final, referencias sin actualizar.
Comparación del 2026-11-01, posterior al merge remoto de las 17:50:20 Costa Rica.

El conector GitHub devolvió 404 y la primera consulta Git falló por DNS sandbox.
La lectura de red autorizada Git/REST resolvió la limitación, sin imprimir
credenciales, sin fetch y sin modificar ningún repositorio independiente.

| Comparación | Resultado verificado |
|---|---|
| main remoto | `19ce9f18281c4d6a73985772824e60d4587bd80c` |
| Padres del merge remoto | `650411bdf0a5b9375fbe6911595f3150d79c633d` y `7f963a98494a74acbe2479c91a372224ec55a033` |
| Árbol remoto y local 7f963a9 | Ambos `6e58edc1251248d1548e5b65fb5e1396f91dd6d7` |
| 650411b → remoto | Ahead 4/behind 0; 31 archivos; dominio/persistencia conservados |
| 7f963a9 → remoto | Un commit merge adicional; cero archivos diferentes |
| CI del HEAD | run 41364044664, push, completed/success; no auditoría de logs |

Evidencia primaria: [commit](https://github.com/a-calderon-org/ms-users-market-tec/commit/19ce9f18281c4d6a73985772824e60d4587bd80c),
[diff desde main local](https://github.com/a-calderon-org/ms-users-market-tec/compare/650411bdf0a5b9375fbe6911595f3150d79c633d...19ce9f18281c4d6a73985772824e60d4587bd80c),
[diff desde preparación](https://github.com/a-calderon-org/ms-users-market-tec/compare/7f963a98494a74acbe2479c91a372224ec55a033...19ce9f18281c4d6a73985772824e60d4587bd80c)
y [CI](https://github.com/a-calderon-org/ms-users-market-tec/actions/runs/41364044664).

Cambian SqlHealthConfig/readiness, SqlUserConfig/MI, SafeJsonLogFormatter,
correlación, perfil sql-appservice, pruebas, reports/workflow SQL y cinco
documentos MTEC-37. Igualdad de árbol cierra incertidumbre de contenido remoto:
las afirmaciones de E11/§5.1 del ADR representan ese contenido. No demuestra
migración, Managed Identity o protección desplegada.

Se inspeccionaron UserService, Email, ExternalIdentityKey, VerifiedExternalIdentity,
AuthenticatedPrincipal, SqlUserStore y V1. Hay dominio/persistencia; no verificador
Google/JWT, correo o sesiones. VerifiedExternalIdentity espera evidencia confiable;
su constructor no autentica y no debe ligarse a input HTTP. Linking está denegado
por defecto. Email conserva local-part/alias y normaliza dominio. V1 exige mapping
único por hashes y comparación de colisiones del adaptador, no persona/correo único.
No se revalidó exhaustivamente el algoritmo de concurrencia de ese repositorio.

**Inferido:** el independiente es fuente práctica de código dominio/persistencia.
**No determinado:** acta de autoridad única/corte/artefacto de despliegue.
`market_tec/contracts/` sigue siendo ubicación canónica versionada; no hay otra
carpeta contracts en el árbol independiente inspeccionado. `app/ms-users` y su
workflow permanecen como fundación sin ese negocio; no se eliminaron ni duplicaron.

### Jira contrastado en solo lectura

| Ticket | Estado consultado | Implicación |
|---|---|---|
| [MTEC-34](https://allanaron06122005.atlassian.net/browse/MTEC-34) | Done | Dominio; ticket menciona GoogleTokenVerifier pero código espera evidencia ya verificada, sin ese verificador |
| [MTEC-35](https://allanaron06122005.atlassian.net/browse/MTEC-35) | Done | Persistencia; 111+34 pruebas reportadas, no repetidas; no prueba runtime Azure |
| [MTEC-37](https://allanaron06122005.atlassian.net/browse/MTEC-37) | In Progress | Merge/estado CI confirmados; MI/APIM/despliegue y acceso directo pendientes |
| [MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36) | To Do | Google en alcance vigente; correo/sesiones requieren coordinación humana |
| [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) | To Do, cero comentarios | Revisión conjunta/aprobación y PR posterior pendientes |
| [MTEC-12](https://allanaron06122005.atlassian.net/browse/MTEC-12) | In Progress | Seguridad APIM/origen pendiente; no bloquea fakes locales |
| [MTEC-15](https://allanaron06122005.atlassian.net/browse/MTEC-15) | In Progress | Borradores/CI publicados, conformidad conjunta pendiente |

## E. Validaciones reproducibles

| Comprobación | Resultado |
|---|---|
| P01–P24 | 24 únicas/consecutivas, todas Proposed; 21 con parte I/A |
| Amenazas | T01–T18 únicas/consecutivas; escenarios, no explotaciones confirmadas |
| Contratos | 12/12 aprobadas; incluyen cuatro pruebas formales JSON Schema Draft 2020-12 |
| OpenAPI | Redocly 2.71.2: 3/3 válidos, cero errores y seis advertencias |
| Advertencias OpenAPI | Idénticas en HEAD/salida; 17 archivos contracts sin cambio de bytes |
| Enlaces/anclas | 54 referencias locales válidas, incluidas 4 anclas; entrada 46/46 |
| Markdown/tablas | 29 tablas rectangulares; bloques cerrados; solo estilo MD013, según detalle |
| Diff | git diff --check correcto, staging vacío, alcance de tres documentos |

Se ejecutó el equivalente al workflow contractual con herramientas aisladas
disponibles, sin instalar dependencias en el worktree:

```sh
PYTHONDONTWRITEBYTECODE=1 /private/tmp/mtec40-validation-venv/bin/python \
  -m unittest discover -s contracts/tests -p 'test_*.py' -v
node /Users/allanaron06122005gmail.com/Library/CloudStorage/OneDrive-EstudiantesITCR/design/market_tec/contracts/node_modules/@redocly/cli/bin/cli.js \
  lint contracts/openapi/users.json contracts/openapi/catalog.json \
  contracts/openapi/notifications.json --format=json
git diff --check
git diff --cached --name-only
git status --short --untracked-files=all
```

Python 3.15 del venv y Node 24.14.0; CI declara Python 3.12/Node 24. Se comprobaron
las versiones fijadas en requirements-validation.txt. No se afirma reproducción
del runtime Python 3.12. Para recrear dependencias, seguir contracts/README.md en
un directorio temporal.

Se exportaron los 17 archivos de contratos con `git show HEAD:contracts/...` a
`/private/tmp/mtec40-qa-subfase2/baseline/`; se ejecutó el mismo CLI por documento
y se compararon ruleId/pointer/severity/código de salida. Además se compararon
bytes de todos los contratos contra HEAD. Resultado idéntico:

| Archivo | Advertencia 1 | Advertencia 2 | ¿Nueva/bloqueante? |
|---|---|---|---|
| users.json | info-license en #/info | operation-4xx-response en GET /health | No/No para validez del draft |
| catalog.json | info-license en #/info | operation-4xx-response en GET /health | No/No para validez del draft |
| notifications.json | info-license en #/info | operation-4xx-response en GET /health | No/No para validez del draft |

No se suprimieron reglas. Las brechas de autenticación de negocio de D son
distintas: validar el borrador no las subsana.

En `/private/tmp` se instalaron markdownlint 0.38.0 y markdown-it 14.1.0 con
scripts de instalación deshabilitados. Se ejecutaron reglas por defecto completas,
sin ocultar estilo. Entrada: 225/8 MD013 en ADR/LOG; salida: 228/9. Informe: 78 MD013.
No hay otras reglas fallidas; el estilo de líneas/tablas largas persiste y
las ampliaciones nuevas se informan expresamente, sin atribuirlas todas al pasado. Se analizaron tablas con Markdown-it,
bloques cercados, filas P/T, estado, enlaces locales y slugs de títulos/duplicados.
No se hizo reformateo masivo de documentación.

Comprobaciones Markdown reproducibles desde el worktree; los módulos viven
fuera del repositorio. El resumen conserva todas las reglas por defecto:

```sh
npm install --prefix /private/tmp/mtec40-qa-subfase2/markdown-tools \
  --ignore-scripts --no-audit --no-fund --package-lock=false \
  markdownlint@0.38.0 markdown-it@14.1.0
node --input-type=module - <<'JS'
import {lint} from '/private/tmp/mtec40-qa-subfase2/markdown-tools/node_modules/markdownlint/lib/exports-sync.mjs';
const files = [
  'context/decisions/ADR-004-seguridad-autenticacion.md',
  'context/decisions/DECISION_LOG.md', 'docs/MTEC40_QA_REVIEW.md'
];
const result = lint({files, config: {default: true}});
for (const [file, errors] of Object.entries(result)) {
  const summary = {};
  for (const e of errors) {
    const rule = e.ruleNames[0];
    summary[rule] = (summary[rule] || 0) + 1;
  }
  console.log(file, errors.length, summary);
}
JS
```

El chequeo complementario de enlaces/tablas/estado se puede reproducir sin
herramientas externas con este subconjunto del verificador ejecutado:

```python
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re, unicodedata
files = [Path('context/decisions') / name for name in (
    'ADR-004-seguridad-autenticacion.md', 'DECISION_LOG.md')]
files += [Path('docs/MTEC40_QA_REVIEW.md')]
def anchors(path):
    counts, result = {}, set()
    for title in re.findall(r'^#{1,6} (.+)$', path.read_text(), re.M):
        title = re.sub(r'[`*_]', '', title).lower()
        slug = ''.join(c for c in title if c in '-_ ' or
                       unicodedata.category(c)[0] in 'LN').replace(' ', '-')
        n = counts.get(slug, 0)
        counts[slug] = n + 1
        result.add(slug + (f'-{n}' if n else ''))
    return result
links = 0
for p in files:
    text = p.read_text()
    # Excluir código de ejemplo del propio informe.
    text = re.sub(r'^```.*?^```[^\n]*$', '', text,
                  flags=re.M | re.S)
    width = None
    for line in text.splitlines():
        if line.startswith('|'):
            cells = len(re.split(r'(?<!\\)\|', line)) - 2
            assert width is None or width == cells
            width = cells
        else:
            width = None
    for href in re.findall(r'\[[^\]\n]+\]\(([^)]+)\)', text):
        if urlsplit(href).scheme:
            continue
        dest, _, fragment = href.partition('#')
        target = (p.parent / unquote(dest)).resolve() if dest else p
        assert target.exists(), href
        assert not fragment or unquote(fragment) in anchors(target), href
        links += 1
adr = files[0].read_text()
for prefix, maximum in [('P', 24), ('T', 18)]:
    ids = re.findall(r'^\| ' + prefix + r'(\d\d)\.', adr, re.M)
    assert list(map(int, ids)) == list(range(1, maximum + 1))
assert '**Estado:** Proposed' in adr
print('Referencias locales verificadas:', links)
```

Comandos de evidencia remota (solo GET y lectura Git):

```sh
git ls-remote https://github.com/a-calderon-org/market_tec.git refs/heads/main
git ls-remote https://github.com/a-calderon-org/ms-users-market-tec.git \
  refs/heads/main refs/heads/recovery/mtec37-appservice-readiness
# Dentro del worktree independiente, sin actualizar referencias:
git rev-parse '7f963a98494a74acbe2479c91a372224ec55a033^{tree}'
# REST GET bajo /repos/a-calderon-org/ms-users-market-tec/:
# commits/19ce9f18281c4d6a73985772824e60d4587bd80c
# compare/650411bdf0a5b9375fbe6911595f3150d79c633d...19ce9f18281c4d6a73985772824e60d4587bd80c
# compare/7f963a98494a74acbe2479c91a372224ec55a033...19ce9f18281c4d6a73985772824e60d4587bd80c
# actions/runs?head_sha=19ce9f18281c4d6a73985772824e60d4587bd80c
```

Limitaciones: enlaces locales no certifican URLs externas. Se consultaron las
fuentes primarias de C, Jira y repositorios; no se hizo barrido HTTP de todos los
enlaces heredados. Pruebas contractuales verifican estructura/ejemplos/eventos,
no autenticación ni seguridad Azure. No se ejecutaron builds/lints de aplicaciones
sin cambios de código ni pruebas de mecanismos todavía no implementados.

## F. Hallazgos y evidencia de correcciones

Severidad según consecuencia si el documento guiara implementación: alta ante
acceso a cuenta/contexto ajeno o bypass; media ante incompatibilidad/falsa garantía;
baja para estilo. No son vulnerabilidades operativas confirmadas. Se citan
secciones estables para evitar líneas desactualizadas después de editar.

| ID/severidad | Archivo/sección y evidencia de entrada | Consecuencia | Corrección o pendiente |
|---|---|---|---|
| H01 Media | ADR-004 §4 P13/P17/P22; DECISION_LOG: 18 I, P17 solo D y P22 F/D aunque §5 exige revalidación/excepciones | Fronteras/rotación tardías, ciclos login/refresh/JWKS | Partes conceptuales A/I explícitas: 21 decisiones con parte A; Azure concreto diferible; aprobación pendiente |
| H02 Alta | ADR-004 §3.1 paso correo 6 recupera por prueba de buzón, tabla recuperación promete proteger cuenta histórica reasignada | Nuevo titular supera login ordinario; excluir recuperación no basta | Garantía restringida y P16 bloqueante con alternativas/evidencia funcional; sin política elegida ni fusión |
| H03 Alta | ADR-004 §3.1 perfil trata azp solo en múltiples audiencias y no explicita tipo email_verified/allowlist Workspace | Token genuino aceptado en contexto/presentador ajeno o autoridad sobre correo mal inferida | Aud única/azp exacto cuando exista, booleano verdadero/hd autorizado como perfil candidato; ratificación pendiente |
| H04 Media | ADR-004 §3.1 recuperación fija reauth 5 min pero solo perfila iat/nonce | Confundir emisión reciente con reautenticación para vínculo | Añadida prueba/reloj pendiente por método; auth_time/max_age solo con flujo compatible |
| H05 Media | ADR-004 §3.4 sesión 8 h/30 min; residual explicado para logout/baja | Prometer corte inmediato aunque JWT previo siga vigente | Expiración de sesión impide refresh; acordar limitar exp o aceptar residual y probar bordes |
| H06 Media | ADR-004 §4 P22 dice «refresh vencido exige sesión» | Renovación caducada aceptada o access expirado rechazado indebidamente | Access expirado puede renovar con refresh vigente; refresh expirado no renueva |
| H07 Media | ADR-004 método/7.1 y DECISION_LOG: contenido remoto No determinado | Incertidumbre de candidato y merge/CI | Padres/diffs/árbol idéntico y estado CI comprobados; Azure/corte formal siguen pendientes |
| H08 Alta, externo | IDENTITY_CONTRACT §6 y OpenAPI GoogleAuthRequest/AuthResponse vs ADR §8.1 | Request cerrado roto y controles nuevos sin contrato | Matriz D identifica aprobación/versionado MTEC-15 por interfaz; contratos sin modificar |
| H09 Media, externo | API_AND_EVENTS POST /auth/google: header codificado HS256; AZURE_INFRASTRUCTURE: JWT_SECRET y discovery Google para Google o interno | Copiar ejemplos incompatibles con emisor interno/RS256 | Ratificado desfase ya advertido en ADR E6/§3.5; actualizar dueños tras aprobación, fuera del alcance |
| H10 Media, externo | GOOGLE_LOGIN líneas 3/14/18 afirma backend verificador/cualquier dominio/ID Google; MICROSERVICES_ARCHITECTURE declara ADR-001 Proposed y llamada síncrona opcional | Prosa obsoleta usada como evidencia o contradicción con ADR-001 | Ratificado ADR E7/§3.5; prevalecen código/ADR Accepted/contratos; sin editar fuentes ajenas |
| H11 Media, humano | ADR-004 §10; MTEC-40 To Do sin comentarios/conformidades | Dirección, merge o QA confundidos con aprobación | Acta vacía; añadida advertencia de revisión técnica/SEG no sustituible por RP; matriz por rol abajo |
| H12 Baja | Redocly/markdownlint, sección E | Estilo no demuestra fallo semántico ni controles de seguridad | Resultados publicados completos, sin supresiones ni reformateo masivo |

El header del ejemplo histórico se comprobó mediante decodificación Base64URL,
no mediante búsqueda literal de HS256. La clave JWT no se confunde con mTLS.
JWKS público y backend aislado no son incompatibles: el canal de publicación
aprobado debe permitir claves/metadata sin abrir negocio ni crear ciclo.

Cambios del QA: ADR-004 y DECISION_LOG únicamente, más este informe solicitado.
Se mantienen P01–P24/T01–T18, la estructura y todas las propuestas sin aprobar.
No cambian ADR-001/002/003, contratos, código, scaffold, Jira, Azure ni otros repos.
Según UPDATE_PROTOCOL no se presentan actualizaciones de implementación ficticias;
los dueños que requieren alineación posterior están identificados en ADR-004 §9.

## Revisión humana por rol

Todas las conformidades: **Pendientes**. Desacuerdos: **No registrados**, no
ausencia acreditada de desacuerdo. Personas/fechas: **No determinado**. Si una
persona cubre varios roles debe registrar cada responsabilidad y referencia.
Las condiciones de salida son propuestas, no evidencia de conformidad.

| Rol | Decisiones | Riesgos | Recomendación | Evidencia y condición de salida | Conformidad | Desacuerdos |
|---|---|---|---|---|---|---|
| Responsable del proyecto | P01–P24; §7.1/8.1 | Coste/capacidad, residual, alcance y doble autoridad | Deliberar B ampliada y resolver por bloque, sin sustituir SEG/componentes | Acta de valores/entornos/revisores, decisión explícita y pendientes con responsable/plazo/corte | Pendiente | No registrados |
| Responsable funcional | P01/P10/P16/P18 | Buzón≠elegibilidad, dominios, reasignación y UX | Confirmar evidencia institucional/continuidad antes de habilitar método | Dominios, prueba/revalidación, titulares sucesivos y recuperación/exclusión definidos | Pendiente | No registrados |
| ms-users | P01–P19/P21–P23; contratos/corte | Mapping, emisión, concurrencia, secretos, vínculo | Contrastar perfil/puertos con código independiente y contratos | Diseño de adaptador/verificador/sesión/intento, pruebas previstas y fuente trazable | Pendiente | No registrados |
| ms-catalog | P02–P13/P15/P17/P19/P20/P22 | Principal falso, contexto ajeno y BOLA | Validación local y autorización por recurso, sin llamada por request a users | Perfil Node/APIM compatible y matriz propietario/participante con casos propios/ajenos | Pendiente | No registrados |
| ms-notifications | P02–P13/P15/P17/P19/P20/P22 | Destinatario/evento confundido con credencial | Separar usuario, autorización y transporte de eventos | Perfil Python compatible, destinatario/recurso/procedencia; sin prometer SSE autenticado | Pendiente | No registrados |
| Frontend | P01/P10/P16/P18/P21–P24 | CSRF/XSS, carreras entre pestañas y cookies bloqueadas | Acordar intento/transporte/reauth/UX antes de migrar | IDs/orígenes, errores/refresh serializado y pruebas de navegador/cross-device rechazado | Pendiente | No registrados |
| APIM/infraestructura | P02–P04/P06–P15/P17/P19/P22–P24 | Ciclos, caché, bypass origen/slot, F1/coste | Separar concepto A/rutas B/evidencia C; no desplegar ejemplos | Matriz por operación/herencia, claims/alg/tipo compatibles y plan de origen/custodio/verificación | Pendiente | No registrados |
| Seguridad | P01–P24/T01–T18 | Contexto, cuentas, compromiso/revocación, abuso/logs | Designar revisor; aceptar/rechazar residuales expresamente | Referencia y dictamen por riesgo, ventana, reauth/continuidad, negativos y seguimiento | Pendiente | No registrados |

## G. Dictámenes y acciones pendientes

**QA técnico-documental: QA PASS WITH NOTES.** Tras corregir contradicciones
demostrables, el paquete es suficientemente preciso para revisión humana. Las
notas son brechas contractuales, continuidad/reauth/expiración, corte/Azure y estilo.
No se presenta como especificación aprobada ni sistema protegido. La auditoría
documental terminó; falta de aprobación humana no convierte su QA en inconcluso.

**Aprobación arquitectónica: PENDING HUMAN APPROVAL.** No hay evidencia suficiente
para APPROVED ni rechazo humano explícito para REJECTED. ADR-001 sigue Accepted;
ADR-002/003/004 siguen Proposed. Aprobaciones de ADR-004 acreditadas: ninguna.

MTEC-36 necesita ratificar estrategia/perfiles A, resolver continuidad/reauth y
semántica temporal, aprobar MTEC-15 por interfaz y registrar autoridad de
código/contratos/revisores. Las partes conceptuales P13/P17/P22 deben acordarse;
SKU/topología Azure y migración Angular completa no se exigen para fakes locales.
Debe coordinarse el alcance Google actual de MTEC-36 con correo y sesiones.

Integración: cerrar parámetros/rutas/principal/transporte B. Despliegue: acreditar
custodia, emergencia/revocación, origen/APIM/MI y controles C con trabajo posterior
autorizado. Faltan seguridad designada, conformidades/desacuerdos, personas/plazos,
aprobación explícita del RP y PR revisado exigido por MTEC-40. No se abre PR ni
se inicia subfase 3 o MTEC-36, y no se modifica ningún ticket.

**MTEC-40 — Subfase 2 auditada. ADR-004 permanece Proposed y pendiente de aprobación humana.**
