# MTEC-40 — QA independiente de ADR-004

Fecha: **2026-11-01**, America/Costa_Rica. Destinatarios: mantenedores,
responsable del proyecto y revisores técnicos/funcionales de MTEC-40.
Este informe es una auditoría técnica; no es un ADR ni un contrato.

> **Vigencia:** los apartados A–G y la matriz por rol conservan el QA histórico
> de la subfase 2 sobre de6192b. La aceptación delimitada posterior, el nuevo
> estado Git y las validaciones de la versión sobre 1ca76fc se registran en
> [H](#h-revisión-posterior--aceptación-delimitada-2026-11-01). Las afirmaciones
> históricas «Proposed» o «ninguna aprobación» no describen esa versión nueva.

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

## H. Revisión posterior — aceptación delimitada 2026-11-01

Fecha: **2026-11-01**, America/Costa_Rica. Destinatarios: mantenedores y
revisores de MTEC-40. Esta revisión posterior acredita la versión nueva;
el QA A–G se conserva como evidencia histórica, sin extender su dictamen.

### Alcance, método y evidencia posterior

Se releyeron íntegramente ADR-004, DECISION_LOG, este informe, ADR-001,
IDENTITY_CONTRACT y Users OpenAPI. Se revisaron el diff inicial y el final,
la gobernanza y el protocolo de mantenimiento, el código de login Angular,
el scaffold ms-users y los validadores existentes. El diff inicial estaba
vacío: el QA previo ya está en HEAD **1ca76fc0ef555ec9efb0fb227da999958a16d489**.
La base reportada de6192b corresponde a la revisión histórica, no al HEAD
de entrada de esta aceptación. No se descartó trabajo preexistente.

**Verificado:** estado Git local, fetch origin, ancestry, dos worktrees,
consulta de solo lectura a Jira MTEC-40/36/15/12, estructura documental,
resultados de los validadores y preservación del QA histórico.
**Verificado documentalmente:** aprobación expresa del responsable del
proyecto del 2026-11-01, limitada al núcleo de ADR-004 §2.1; no procede de
un merge ni de un dictamen técnico. No acredita implementación o firmas de
otros revisores.
**Inferido:** la estructura separa núcleo aceptado y parámetros pendientes
sin exigir un ADR adicional; sus controles requieren revisión y pruebas.
**Documentado pero no verificado:** controles futuros, pruebas y evidencia
remota del repositorio independiente consignadas en A–G; no se repitió su
auditoría ni su CI. **No determinado:** Azure efectivo, revisores nominales,
conformidades técnicas, plazos comprometidos y corte operativo de ms-users.

La consulta Jira mantiene MTEC-40 y MTEC-36 To Do; MTEC-15 y MTEC-12
In Progress. MTEC-40 aún describe Proposed y 16 amenazas; MTEC-36 sigue
centrado en Google. Se registra el desfase frente al núcleo Accepted y a
T01–T18 sin modificar tickets. La guía primaria Google enlazada en C se
reconsultó para confirmar el límite de autoridad sobre buzones externos;
no se dedujo posesión actual solo de email_verified.

### Sincronización e inventario conservador

Repositorio verificado: **a-calderon-org/market_tec**. No se operó
ms-users-market-tec. Los dos worktrees registrados se preservaron; el
principal de OneDrive contiene main y el worktree de MTEC-40 es el de A.

- main antes/después: de6192b4df8f75df1f58ad07b9c03710b2cc91c1.
- origin/main tras fetch: 0e714333d86a744188cbd162e6dc402601dfd76e.
- Comparación main...origin/main: 0 commits exclusivos locales, 2 remotos;
  ancestry confirma avance posible mediante fast-forward.
- Sincronización detenida por worktree main sucio: cuatro archivos
  modificados en context/phase2 y dos sin seguimiento. No se ejecutó merge,
  stash, reset, cambio de rama ni integración en MTEC-40.

Cambios ajenos preservados en main:

- context/phase2/API_AND_EVENTS.md
- context/phase2/IMPLEMENTATION_ROADMAP.md
- context/phase2/JIRA_BACKLOG.md
- context/phase2/MICROSERVICES_ARCHITECTURE.md
- MARKETTEC_JIRA_INVENTORY.md (sin seguimiento)
- contracts/COLLABORATION.md (sin seguimiento)

Inventario previo a cualquier borrado, confirmado al cierre:

- **main**: SHA de6192b4df8f75df1f58ad07b9c03710b2cc91c1;
  upstream origin/main. Es ancestro de origin/main. Activa en el worktree
  principal; cuatro modificaciones y dos archivos sin seguimiento.
  **Conservar:** rama principal protegida, activa y con trabajo pendiente.
- **docs/mtec40-adr004-formal-review**:
  SHA 1ca76fc0ef555ec9efb0fb227da999958a16d489;
  upstream origin/docs/mtec40-adr004-formal-review.
  Es ancestro de origin/main; cero commits fuera de ese historial.
  Activa en su worktree; limpia al entrar, tres documentos modificados al
  salir. **Conservar:** rama MTEC-40 expresamente protegida y activa.

Resultado: **2 ramas evaluadas, 0 elegibles, 0 eliminadas**. Se comprobaron
branch -vv, --merged/--no-merged origin/main, for-each-ref, merge-base
--is-ancestor y worktree list --porcelain. No se borraron ramas remotas,
worktrees o directorios ni se ejecutó prune.

### Decisiones auditadas y riesgos retenidos

Se revisaron las 24 filas, con estado separado por alcance:

- **P01 Accepted:** B ampliada, ambos métodos en primera versión, identidad
  y sesiones comunes. La conformidad técnica de componentes sigue pendiente.
- **P05/P10/P16/P17/P19/P20/P22 Accepted parcial:** identidad interna,
  política funcional de sesión, dominios/elegibilidad y límite de vínculo,
  reparto de validación/autorización, propagación y clases de excepción.
  Sus perfiles, mecanismos e interfaces conservan detalles Proposed.
- **P02/P03/P04/P06/P07/P08/P09/P11/P12/P13/P14/P15/P18/P21/P23/P24
  Proposed:** algoritmo/claims, issuer/audience, tiempos JWT, JWKS,
  custodia/rotación, revocación, desafíos/enlaces, perfil Google,
  navegador/CSRF/CORS/cookies y operación/cuotas/logs sin aprobación nueva.

Recuento: **1 Accepted, 7 Accepted parcial, 16 Proposed**. P01 ya no es
una elección pendiente; las otras **20 filas** históricamente ligadas a I
conservan algún acuerdo técnico inicial por cerrar. P14/P20/P24 mantienen
sus mínimos locales y propietarios/hitos F/D según ADR §4; no son nuevos
bloqueos de infraestructura para fakes locales. P01 Accepted no acredita
conformidad de servicios, frontend, APIM ni SEG.

La elegibilidad básica ya está aprobada: posesión verificada en los tres
dominios exactos, sin matrícula/empleo externos ni roles o clasificación
por dominio. El riesgo de continuidad del titular de buzones reasignados
sigue abierto en P16; no se convierte en barrera de afiliación al acceso
básico. La no fusión automática y prueba reciente de ambos métodos para
vincular se conservan. No se cambian atributos ni contratos.

La ventana de sesión es **60 minutos**; aviso y opción de continuar con
backend autoritativo. Nueva ventana de hasta 60 min solo con sesión,
usuario y credencial válidos, rotación y anti-replay, dentro de un máximo
absoluto aún pendiente. Sesión expirada se invalida en servidor y exige
autenticación nueva; un clic no basta. Aviso a cinco minutos y acceso JWT
de 15 minutos son candidatos. No se aprueban 8 h absolutas ni 30 min de
inactividad. Siguen abiertos inactividad/máximo absoluto, compromiso,
revocación/residual, cookies/CSRF/CORS/ámbitos, pestañas, carreras y prueba
de reautenticación sensible.

Se mantienen T01–T18 y los controles del QA previo: aud/azp e issuer
Google, autoridad sobre email/hd, continuidad de cuenta, reautenticación,
replay bearer, expiración de JWT distinta de sesión, compromiso con cachés
calientes y consumo atómico de enlace. Ninguna amenaza se cierra por
aceptación documental. La comunicación interna requiere identidad de
servicio, autenticidad/integridad de eventos y delegación explícita
acotada cuando corresponda; no se reenvían JWT indiscriminadamente.

### Validación posterior reproducible

- Contratos: **12/12** pruebas aprobadas, incluidas cuatro de JSON Schema
  Draft 2020-12; entorno temporal fijado usado en E, sin instalar en el repo.
- OpenAPI: **3/3 válidos, 0 errores y 6 advertencias**, idénticas a entrada:
  info-license en info y operation-4xx-response en GET /health para cada
  archivo. Comparación por regla, severidad y puntero; no se suprimen reglas.
- Markdown: solo MD013. ADR **228 → 207**, LOG **9 → 4**, QA **78 → 78**;
  total **315 → 289**, sin otras reglas fallidas ni aumento de advertencias.
  Se ajustan líneas de prosa editada, sin reformatear tablas históricas.
- Enlaces/anclas: **57 referencias locales válidas**, incluidas **8 anclas**;
  entrada 54 referencias/4 anclas. Los destinos no se infieren de títulos.
- Tablas/bloques: **31 tablas rectangulares**, bloques cercados cerrados;
  entrada 29 tablas. P01–P24 y T01–T18 únicas, consecutivas y sin pérdida.
- Semántica: ADR y LOG coinciden en núcleo Accepted, autoridad, fecha y
  límites; conteo 1/7/16 y 20 acuerdos técnicos I pendientes comprobado.
  Sin afirmación vigente de aceptación total o de ADR-004 todavía Proposed.
- Preservación: A–G y matriz de roles idénticos byte a byte tras retirar
  únicamente el aviso de vigencia y H; 17 contratos idénticos a entrada/HEAD.
  Las seis rutas ajenas de main y ambos índices Git conservan SHA-256.
- Diff: git diff --check correcto; solo los tres documentos autorizados,
  staging vacío y rama/HEAD/worktrees preservados. Revisión completa del
  delta de estado, políticas, tablas y evidencia histórica.

Comandos de esta revisión, desde el worktree MTEC-40; herramientas de E:

```sh
PYTHONDONTWRITEBYTECODE=1 /private/tmp/mtec40-validation-venv/bin/python \
  -m unittest discover -s contracts/tests -p 'test_*.py' -v
# Usar el CLI Redocly fijado y disponible según E:
node /private/tmp/mtec40-accepted-20261101/validate.mjs baseline
node /private/tmp/mtec40-accepted-20261101/validate.mjs actual
git diff --check
git diff --cached --name-only
git status --short --untracked-files=all
```

La validación complementaria usa markdownlint 0.38.0 y Markdown-it 14.1.0
sin supresión de reglas; comprueba enlaces/anclas, tablas, bloques, estados,
conteos y preservación histórica. Baseline se obtiene de los tres archivos
antes de editar; el verificador y resultados auxiliares están fuera del repo
en /private/tmp/mtec40-accepted-20261101. La comparación Redocly ejecuta el
CLI 2.71.2 por archivo sobre los mismos 17 contratos, en baseline y salida.
Python 3.15/Node 24.14.0 locales difieren del Python 3.12 del CI; no se
atribuye reproducción de ese runtime ni reejecución remota del workflow.

### Dictamen, limitaciones y acciones

**QA posterior: QA PASS WITH NOTES. Arquitectura base: Accepted por el
responsable del proyecto el 2026-11-01. Perfil de seguridad: pendiente.**
Las notas son los riesgos abiertos de continuidad/reauth/residual,
contratos, corte operativo/Azure y estilo MD013; no se declaran controles
implementados ni revisiones humanas terminadas. La sincronización main
quedó detenida por sus cambios locales; limpieza revisada sin ramas
eliminables. Ambos límites son resultados conservadores de la inspección.

La aprobación base no acredita perfil de seguridad, certificación,
contratos MTEC-15, conformidades técnicas ni controles efectivos Azure.
No se ejecutaron pruebas de autenticación aún no implementada, builds de
aplicaciones sin cambios, Maven/SQL del independiente, barrido de todas
las URLs externas, ataques, envío de correo o pruebas/configuración Azure.
Los validadores contractuales verifican borradores, no seguridad operativa.

Pendientes: designar SEG y revisores nominales; resolver parámetros I,
continuidad/reauth y aceptación residual; aprobar interfaces MTEC-15;
coordinar ambos métodos/sesiones en MTEC-36 y autoridad única de ms-users;
asignar personas/fechas y obtener registro revisado de MTEC-40. La
aprobación del RP se limita al núcleo y no sustituye ninguna conformidad
técnica o de seguridad pendiente. No se declara terminada revisión humana.

Solo se modifican ADR-004, DECISION_LOG y este addendum con su aviso de
vigencia. Según UPDATE_PROTOCOL no cambian hechos de implementación;
ADR-004 §9 identifica dueños para alineación posterior. No se modifican
ADR-001/002/003, contratos, código, workflows, índice Git ni cambios locales
ajenos. No hubo commit, push, PR, merge, cambios Jira, Azure o APIM.
MTEC-40 sigue abierto; no se inicia MTEC-36 ni otra subfase automáticamente.

## I. Conciliación de sesiones y bloqueo de main 2026-11-01

Fecha: **2026-11-01**, America/Costa_Rica. Destinatarios: mantenedores y
revisores de MTEC-40. Este addendum prevalece para sesiones, Jira y diagnóstico
Git; A–H conservan sus resultados históricos íntegros. No acredita revisión
humana de seguridad ni implementación de controles.

### Alcance, metodología y evidencia

Se contrastaron ADR-004, DECISION_LOG, este QA, ADR-001, contrato de identidad,
Users OpenAPI, P01–P24, T01–T18 y validadores existentes. Se inspeccionaron los
seis archivos de main y el diff completo de sus cuatro archivos versionados,
HEAD, índices, worktrees, ancestry y rutas modificadas por origin/main.
Se consultaron en solo lectura Jira MTEC-40/36/15 y MTEC-9/13/19/22/31 para
identificar trabajo relacionado; no se modificaron tickets.

**Verificado:** git ls-remote confirma main remoto en
0e714333d86a744188cbd162e6dc402601dfd76e, igual a origin/main local.
La consulta también solicitó docs/mtec40-adr004-formal-review y no devolvió esa
rama remota; su referencia origin local permanece, pero no acredita existencia
remota vigente. No se hizo fetch ni prune. El primer intento remoto falló por
DNS restringido; la repetición de solo lectura completó.

**Verificado documentalmente en Jira:** MTEC-40 está In Progress, sin
comentarios; su descripción registra Accepted delimitado y límites 60/30/8.
MTEC-36 sigue To Do y bloqueado por MTEC-40; ya incluye ambos métodos y sesiones.
MTEC-15 sigue In Progress, con borradores/CI publicados y revisión conjunta
pendiente. Actualizaciones consultadas del 2026-11-01: MTEC-40 a las 19:08:26,
MTEC-36 a las 19:07:58 y MTEC-15 a las 19:08:29, todas -06:00. Las referencias
de H a MTEC-40 To Do y MTEC-36 solo Google ya son históricas.
Fuentes: [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40),
[MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36) y
[MTEC-15](https://allanaron06122005.atlassian.net/browse/MTEC-15).
La autoridad es la aprobación del responsable del proyecto el 2026-11-01,
ratificada en las descripciones; no el merge, el estado del ticket o este QA.

**Inferido:** relación de cambios de main con tickets por contenido; no prueba
autoría, encargo ni aprobación. **Documentado pero no verificado:** CI histórico
y controles futuros; no se reejecutó CI remoto ni se auditó ms-users independiente.
**No determinado:** revisores nominales, conformidades técnicas/seguridad,
actividad humana implementada, aprobación contractual conjunta y Azure efectivo.

### Política conciliada y decisiones P01–P24

Fuente canónica: [ADR-004 §3.4](../context/decisions/ADR-004-seguridad-autenticacion.md#34-expiración-renovación-revocación-y-replay),
reflejada en §2.1, P10, §8, acta §10 y DECISION_LOG.

- Ventana renovable de 60 minutos, inactividad de 30 minutos y máximo absoluto
  de ocho horas desde el login inicial. Vence el primer límite aplicable.
- Advertencia previa; renovación solo por solicitud válida mientras siga
  vigente y expiración verificada en servidor. Al vencer se exige
  reautenticación; ninguna renovación reinicia el máximo absoluto.
- Sondeos automáticos no cuentan como actividad humana. Su señal, validación
  y cómputo seguro necesitan especificación; polling/refresh o un timestamp
  del navegador no bastan para mantener viva la sesión.
- Renovación requiere mecanismos seguros por diseñar. JWT de 15 min, aviso
  de 5 min, refresh rotatorio y sus detalles, cookies/CSRF/CORS, skew y claves
  siguen Proposed. No se aprueba acceso residual tras vencer la sesión;
  P10/P15 deben diseñar cómo cumplir esos límites en todos los validadores.

P01–P24 mantienen **1 Accepted, 7 Accepted parcial y 16 Proposed**, con T01–T18
completas. P10 sigue parcial: límites resueltos, mecanismos pendientes. Las
20 filas con algún acuerdo técnico I pendiente conservan ese alcance.
MTEC-36 sigue dependiendo de revisión MTEC-40 y contratos MTEC-15 por interfaz;
la ampliación funcional en Jira no autoriza implementación interoperable completa.
No se atribuyen nuevas conformidades técnicas ni certificaciones de seguridad.

### Estado Git e inventario de main

| Worktree | Rama y HEAD | Estado de entrada y salida |
|---|---|---|
| Principal OneDrive, market_tec | main, de6192b4df8f75df1f58ad07b9c03710b2cc91c1 | Cuatro modificados y dos sin seguimiento; staging vacío; preservados |
| ~/Developer/MarketTec/worktrees/market-tec-mtec40 | docs/mtec40-adr004-formal-review, 1ca76fc0ef555ec9efb0fb227da999958a16d489 | Tres documentos modificados preexistentes; solo esos tres editados; staging vacío |

main...origin/main: **0 commits exclusivos locales / 2 remotos**, sin divergencia;
main es ancestro. Los commits 1ca76fc y 0e71433 solo cambian ADR-004, DECISION_LOG
y docs/MTEC40_QA_REVIEW.md. Ninguna de las seis rutas siguientes está en ese delta;
los dos archivos untracked tampoco existen en origin/main.

| Archivo local | Cambio inspeccionado | Relación y conservación recomendada |
|---|---|---|
| context/phase2/API_AND_EVENTS.md | +33/-3: compatibilidad Angular plana, message.sent v1, borradores y corrección reintentos/DLQ | MTEC-15; filtros/paginación MTEC-9/13; eventos MTEC-31/22. Conservar delta en su ruta para revisión contractual |
| context/phase2/IMPLEMENTATION_ROADMAP.md | +17/-2: ADR-001 Accepted, hitos y secuencia de PR | MTEC-15 y planificación por servicios. Conservar junto con COLLABORATION, enlazado desde este delta |
| context/phase2/JIRA_BACKLOG.md | +17/-1: corte 29-10, cobertura contractual y recomendaciones sin duplicados | MTEC-15/9/13 e identidad/eventos. Conservar; revisar estados históricos y claves propuestas antes de adoptar |
| context/phase2/MICROSERVICES_ARCHITECTURE.md | +19/-4: ADR-001 Accepted, ownership y eliminación de consulta síncrona por operación a users | ADR-001/MTEC-19 y MTEC-36/40. Conservar; la prosa JWT pendiente precede al núcleo Accepted actual |
| MARKETTEC_JIRA_INVENTORY.md | Sin seguimiento: inventario técnico, evidencia, deuda y propuestas MTEC-1–18, corte 18-10 | Fuente citada por MTEC-9/13. Preservar íntegro; decidir después si conservar como auditoría histórica o consolidar, sin asumir estados vigentes |
| contracts/COLLABORATION.md | Sin seguimiento: ownership A/B/C, fakes, contratos y secuencia de PR | MTEC-15 y coordinación de servicios. Conservar con roadmap; no convertir propuesta en asignación aprobada |

La relación por contenido es **Inferida**; existencia y descripción de los
tickets citados se verificaron en Jira. Los cambios son anteriores a esta tarea
y requieren revisión propia de estados, arquitectura y planificación. No se
corrigen automáticamente ni se incorporan al trabajo MTEC-40.

Riesgo de conflicto con 0e71433: **bajo, sin intersección de rutas**. Persiste
riesgo de perder trabajo al limpiar/cambiar de rama/mover untracked sin respaldo,
y de introducir prosa obsoleta o romper el enlace roadmap/COLLABORATION.
**Sincronización bloqueada: main continúa sucio.** No se declara sincronizado.

### Procedimiento de preservación y sincronización; no ejecutado

1. Conservar los seis archivos en el worktree principal y los tres documentos
   MTEC-40 en su worktree actual. Releer estado, HEAD y main remoto antes de
   cualquier operación futura; no asumir que 0e71433 seguirá vigente.
2. En una operación posterior autorizada, guardar respaldo externo duradero
   de los seis archivos completos, diff binario de los cuatro versionados,
   estado/HEAD y hashes. Copiar untracked explícitamente: git diff no los
   incluye. Respaldar los tres documentos y delta MTEC-40 por separado.
   Verificar hashes y git apply --check sobre una copia de la base de6192b,
   sin aplicar parches al worktree real.
3. Revisar con el mantenedor qué conservar como cambio técnico o evidencia
   histórica. Si después autoriza Git, preservar lo seleccionado en una rama
   propia de documentación/contratos basada en de6192b, con commit revisado
   y respaldo íntegro de lo restante. No trasladar ni eliminar untracked por
   inferencia; su destino requiere decisión expresa. No mezclarlo con MTEC-40.
4. Solo después de preservar el trabajo y dejar main limpio deliberadamente,
   actualizar referencias, verificar ancestry/rutas y avanzar mediante
   git merge --ff-only origin/main. Ante divergencia, colisión o cambios
   locales, detenerse para revisión; no reset, clean, stash automático ni
   sobrescritura. Repetir estado, diff --check y validación pertinente.

No se ejecutaron traslado, limpieza, commit ni avance. La evidencia temporal
externa de esta auditoría no sustituye el respaldo duradero recomendado.

### Validaciones y preservación

- Contratos: 12/12 pruebas aprobadas, incluidas cuatro formales JSON Schema.
- OpenAPI: 3/3 válidos, cero errores y seis advertencias preexistentes:
  info-license y operation-4xx-response en GET /health, dos por contrato.
- Enlaces/anclas: 61 referencias locales válidas, incluidas 12 anclas;
  33 tablas rectangulares y bloques cercados cerrados.
- Markdown: solo MD013; ADR 207 → 208, LOG 4 → 3, QA 78 → 87;
  total 289 → 298. Nueve avisos netos añadidos; ninguna otra regla fallida.
  Se conservan tablas largas y resultados históricos, sin supresión de reglas.
- Semántica: P01–P24/T01–T18 íntegras, estados 1/7/16 y 20 acuerdos técnicos
  I pendientes; política y estado Jira coherentes en ADR/LOG y este addendum.
- Preservación: A–H son prefijo idéntico byte a byte al QA de entrada;
  25 hashes SHA-256 sin cambios: seis archivos de main, 17 contratos y ambos
  índices Git. Solo los tres documentos autorizados difieren en MTEC-40.
- git diff --check correcto en ambos worktrees; staging vacío, ramas y HEAD
  sin cambios. main conserva cuatro modificados y dos sin seguimiento.

Reproducción desde el worktree MTEC-40 con las herramientas fijadas de E:

```sh
PYTHONDONTWRITEBYTECODE=1 /private/tmp/mtec40-validation-venv/bin/python \
  -m unittest discover -s contracts/tests -p 'test_*.py' -v
node /Users/allanaron06122005gmail.com/Library/CloudStorage/OneDrive-EstudiantesITCR/design/market_tec/contracts/node_modules/@redocly/cli/bin/cli.js \
  lint contracts/openapi/users.json contracts/openapi/catalog.json \
  contracts/openapi/notifications.json --format=json
node /private/tmp/mtec40-sessions-20261101/validate.mjs baseline
node /private/tmp/mtec40-sessions-20261101/validate.mjs actual
git diff --check
git diff --cached --name-only
```

El verificador complementario adapta H a baseline Accepted y comprueba A–H
como prefijo intacto, enlaces/anclas, tablas/cercas, P/T, estados y sesiones.
Usa Markdown-it 14.1.0 y markdownlint 0.38.0 con reglas por defecto completas,
sin supresiones. No prueba mecanismos de seguridad. No se instalaron módulos
en el repositorio ni se ejecutaron builds sin cambios de código, pruebas de
sesión aún no implementada, CI remoto, barrido HTTP de todas las URLs, Azure
ni SQL. Python local 3.15 difiere de 3.12 en CI; Node local 24.14.0.

### Dictamen de preparación y pendientes

**QA documental: QA PASS WITH NOTES. ADR-004 Accepted exclusivamente para
arquitectura y política funcional aprobadas; perfil de seguridad pendiente.**
Las notas son MD013, actividad/renovación, revocación, contratos,
continuidad/reauth, transición operativa y evidencia Azure.

El delta es revisable para futuro commit/push de MTEC-40 por el mantenedor,
con revisión de los cambios preexistentes y este addendum. No acredita cierre
de MTEC-40, revisión técnica/seguridad ni inicio de MTEC-36. main no está
preparado para sincronización mientras esos seis archivos sigan sin resolver.
No hubo commit, push, merge, PR, staging, cambio de rama, reset, clean, stash,
rebase, force push, prune ni operación Azure/Jira. No se inicia subfase 3.

Según UPDATE_PROTOCOL solo cambian ADR-004, DECISION_LOG y este QA. No se
alteran hechos de implementación, contratos ni configuración; no procede
actualizar documentación de ejecución como si los controles ya existieran.

## J. Validación de prepublicación — 2026-11-02

Fecha: **2026-11-02**, America/Costa_Rica. Destinatarios: mantenedores y
revisores técnicos de MTEC-40. Alcance: los tres documentos autorizados,
compatibilidad del diff contra main remoto y repetición del QA documental.
A–I se conservan íntegros; esta comprobación no añade aprobación de seguridad.

### Metodología, evidencia y base de revisión

**Verificado:** worktree MTEC-40 y rama docs/mtec40-adr004-formal-review,
HEAD de entrada 1ca76fc0ef555ec9efb0fb227da999958a16d489; tres modificaciones
preexistentes y staging vacío. Se leyeron íntegramente ADR-004, DECISION_LOG
y este QA, además de gobernanza, ADR-001, identidad, Users OpenAPI y CI.
Se contrastaron los flujos con código Angular y contratos, sin modificarlos.

Tras git fetch origin, main remoto y origin/main coinciden en
0e714333d86a744188cbd162e6dc402601dfd76e. El merge-base real con HEAD es
1ca76fc0ef555ec9efb0fb227da999958a16d489. El único commit remoto adicional
es el merge 0e71433, con árbol idéntico a HEAD:
62e1ac646831ee2b75f5c00e27a96d4298bad50d. No introduce diferencias de
archivos desde el ancestro común; el diff previsto del PR comprende únicamente
ADR-004, DECISION_LOG y este QA. No se integra main en la rama.

git ls-remote --heads origin confirmó main y la ausencia de la rama MTEC-40
en GitHub antes de publicar; la referencia origin local antigua no demuestra
su existencia remota. La consulta inicial sin acceso de red falló por DNS;
la repetición con acceso de lectura completó correctamente.

**Verificado documentalmente en Jira:** consulta de solo lectura de MTEC-40,
MTEC-36, MTEC-15, MTEC-12 y MTEC-37: estados In Progress, To Do, In Progress,
In Progress e In Progress respectivamente. MTEC-40 y MTEC-36 registran ambos
métodos, los tres dominios exactos y sesiones 60 min/30 min/8 h; no hay nuevas
conformidades técnicas acreditadas. No se modificó Jira.

### Resultados reproducidos

- Suite contractual: **12/12 aprobadas**, incluidas cuatro pruebas formales
  de JSON Schema Draft 2020-12 y sus ejemplos positivos/negativos.
- Redocly **2.71.2**: **3/3 OpenAPI válidos**, cero errores y seis avisos.
  Comparación por regla, severidad y puntero contra contratos exportados de
  HEAD: idénticos. Son info-license y operation-4xx-response en GET /health
  para cada servicio; ningún contrato fue modificado.
- Markdown-it **14.1.0**: **61 referencias locales válidas, 12 anclas,
  33 tablas rectangulares**, cercas cerradas. Se analizan también enlaces
  cuyos rótulos ocupan varias líneas.
- P01–P24 y T01–T18 únicas y consecutivas; estados **1 Accepted, 7 Accepted
  parcial, 16 Proposed**. Revisión de P10/P15, §2.1/3.4/8/10 y DECISION_LOG:
  primer límite aplicable, renovación solo vigente, ocho horas sin reinicio,
  reloj servidor y sondeos sin actividad humana coherentes. JWT/aviso exactos,
  revocación y mecanismos de seguridad permanecen pendientes.
- markdownlint **0.38.0**, todas las reglas por defecto: únicamente MD013.
  HEAD → versión recibida/final: ADR **228 → 208**, LOG **9 → 3**,
  QA **78 → 87**; total **315 → 298**. Por contenido de línea, ADR conserva
  169 avisos, añade/cambia 39 y retira/cambia 59; LOG conserva tres y retira
  seis; QA conserva 78 y añade nueve en H/I. Este apartado no añade avisos.
  No se atribuyen todos al pasado ni se ocultan reglas. Su pertinencia es
  de estilo: tablas, referencias y prosa larga; no justifica alterar decisiones.
- Preservación: QA de entrada A–I es prefijo idéntico byte a byte; 17 contratos
  idénticos a HEAD/entrada. main conserva HEAD de6192b, rama, índice, diff y
  hashes de sus seis archivos (cuatro modificados y dos sin seguimiento).
- git diff --check correcto; revisión del delta de los tres documentos sin
  contratos, secretos, respaldos, logs privados ni cambios ajenos.

Comandos ejecutados desde el worktree MTEC-40, con herramientas temporales:

```sh
QA_TMP=/private/tmp/mtec40-publication-20261102
PYTHONDONTWRITEBYTECODE=1 "$QA_TMP/venv/bin/python" \
  -m unittest discover -s contracts/tests -p 'test_*.py' -v
python3 "$QA_TMP/openapi.py"
node "$QA_TMP/validate.mjs" head
node "$QA_TMP/validate.mjs" input
node "$QA_TMP/validate.mjs" actual
node "$QA_TMP/md013.mjs"
python3 "$QA_TMP/snapshot.py" verify
git diff --check
git diff --cached --check
```

Se recrearon fuera del repositorio las dependencias fijadas en
requirements-validation.txt y las versiones Markdown de E; el CLI Redocly
ya disponible en el worktree principal se usó en lectura. Los auxiliares
temporales exportan HEAD, ejecutan ese mismo CLI por archivo y comparan sus
diagnósticos; analizan Markdown y huellas de preservación. No se versionan.
El verificador histórico de E exige Proposed y no aplica al baseline Accepted:
se adaptó a los estados reales y al análisis de enlaces con Markdown-it.

### Dictamen, riesgos y acciones pendientes

**QA de prepublicación: QA PASS WITH NOTES.** Arquitectura base Accepted por
el responsable del proyecto el 2026-11-01; conformidades técnicas y de
seguridad pendientes. No se detectan cambios remotos incompatibles ni fallos
nuevos bloqueantes. Persisten continuidad de buzón, reautenticación, actividad,
refresh/replay, revocación/residual, claves, contratos y acceso directo/Azure.

Python local **3.15.0** y Node **24.14.0**; no se reproduce Python 3.12 del CI.
GitHub Actions del nuevo candidato no se acredita ejecutado/aprobado. El
workflow contractual solo se dispara por cambios en contracts o su workflow;
este alcance documental no satisface ese filtro. No se ejecutan builds de
aplicaciones sin cambios, autenticación no implementada, Maven/SQL del servicio
independiente, barrido HTTP externo ni pruebas/configuración Azure.

Pendientes: crear manualmente el PR como Draft, revisión por servicios,
frontend, APIM y seguridad; acordar perfil y riesgos; aprobar interfaces en
MTEC-15 y coordinar MTEC-36/MTEC-12/MTEC-37. MTEC-40 continúa In Progress;
MTEC-36 permanece To Do. Según UPDATE_PROTOCOL, solo se publican las dos
fuentes de decisión y este QA; no cambian hechos de ejecución ni contratos.
