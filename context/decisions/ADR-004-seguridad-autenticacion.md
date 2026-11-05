# ADR-004: Seguridad de autenticación y fronteras de confianza

**Estado:** Accepted — arquitectura base y decisiones delimitadas en §3.4.1
**Fecha:** 2026-10-31
**Revisión técnica inicial:** 2026-11-01 — MTEC-40, subfases 1 y 2; [informe QA](../../docs/MTEC40_QA_REVIEW.md)
**Fecha de aceptación de la dirección arquitectónica:** 2026-11-01
**Autoridad de la decisión:** responsable del proyecto
**Deciders:** Responsable del proyecto; arquitectura base aprobada expresamente
**Revisores requeridos:** responsables de los tres microservicios, frontend, APIM/infraestructura y revisión de seguridad designada por el proyecto
**Contexto:** MTEC-40 — revisión y decisión de arquitectura; dependencias MTEC-12, MTEC-15, MTEC-34, MTEC-35, MTEC-36 y MTEC-37; antecedente MTEC-17
**Destinatarios:** desarrolladores y mantenedores de MarketTec

> **Arquitectura base aceptada; perfil aprobado parcialmente el 2026-11-02 (§3.4.1).** El responsable
> del proyecto aprobó expresamente el 2026-11-01 la alternativa B ampliada,
> ambos métodos en la primera versión, la elegibilidad básica, las
> responsabilidades, la comunicación entre servicios y la política de sesión:
> ventana renovable de 60 minutos, 30 minutos de inactividad y máximo absoluto
> de ocho horas desde el login inicial. La ampliación delimitada del 2026-11-02
> figura en §3.4.1. Accepted comprende ese alcance y el núcleo de 2.1: no
> aprueba todos los
> parámetros P01–P24, no acredita conformidad de revisores ni certificación de
> seguridad, no aprueba contratos MTEC-15, no habilita la implementación
> completa de MTEC-36 ni acredita configuración Azure/APIM. MTEC-40 sigue
> abierto. ADR-001 continúa Accepted; ADR-002 y ADR-003 continúan Proposed.

## 1. Contexto, alcance y evidencia

Se necesita formalizar dos métodos de acceso —Google Identity Services y correo institucional verificado sin obligación de usar Google— que resuelvan una identidad interna única, y los controles que separan navegador, gateway, servicios y datos. También se debe distinguir la distribución de dominios de ADR-001 de la distribución física de repositorios. Una sesión visual en Angular no demuestra autenticación del servidor. Una firma JWT válida tampoco concede por sí sola acceso a un perfil, publicación, chat o notificación.

### Método y límites

La evidencia inicial se elaboró sobre `ee198d4e78115834d7615e273d9007d2b719ee96`; la revisión del 2026-10-31 usó `5dc2d1ebf981b8009fb5b268d7c857e6a1167496`. Esta revisión del **2026-11-01** contrasta íntegramente ADR-004, DECISION_LOG, ADR-001, IDENTITY_CONTRACT y Users OpenAPI sobre `market_tec@de6192b4df8f75df1f58ad07b9c03710b2cc91c1`, con código Angular/adaptadores, configuración y validadores existentes. Se consultaron en solo lectura MTEC-40, MTEC-36, MTEC-15, MTEC-12, MTEC-34, MTEC-35 y MTEC-37; MTEC-17 conserva su evidencia histórica. Se contrastaron las recomendaciones con documentación primaria enlazada de Google, Microsoft, IETF y OWASP.

El conector GitHub devolvió 404 para `ms-users-market-tec`. La subfase 1 inspeccionó objetos locales de `main@650411bdf0a5b9375fbe6911595f3150d79c633d` y de la preparación MTEC-37 en `7f963a98494a74acbe2479c91a372224ec55a033`, sin resolver entonces el contenido remoto. En la subfase 2, `git ls-remote` y consultas de solo lectura a GitHub REST confirmaron `main@19ce9f18281c4d6a73985772824e60d4587bd80c`: es un merge de esas dos bases y su árbol coincide exactamente con `7f963a9` (`6e58edc1251248d1548e5b65fb5e1396f91dd6d7`). Por ello el contenido local inspeccionado sí representa ese HEAD remoto. GitHub informa success para el run `41364044664` de ese SHA; se leyó su estado, sin auditar logs ni reejecutar pruebas. No se modificó ese repositorio ni se deduce despliegue de ese merge/CI. Evidencia, comandos y límites en el informe QA y 7.1.

La aceptación delimitada posterior del **2026-11-01** se registra sobre
`market_tec@1ca76fc0ef555ec9efb0fb227da999958a16d489`, preservando la evidencia
del QA anterior. Se releyeron los seis documentos y el informe QA; se
consultaron MTEC-40, MTEC-36, MTEC-15 y MTEC-12 en solo lectura. La autoridad
del núcleo Accepted es la aprobación expresa del responsable del proyecto de esa
fecha, no un merge ni el dictamen QA. La consulta posterior de Jira del mismo
día ya registra el núcleo Accepted y la política 60 min/30 min/8 h en MTEC-40
y MTEC-36. MTEC-40 está In Progress; MTEC-36 sigue To Do y bloqueado. Los
contratos y las conformidades técnicas continúan pendientes; no se modificaron
tickets ni se infirieron nuevas conformidades. Los resultados
posteriores están en el [addendum
QA](../../docs/MTEC40_QA_REVIEW.md#h-revisión-posterior--aceptación-delimitada-2026-11-01).
La [conciliación posterior de sesiones y
main](../../docs/MTEC40_QA_REVIEW.md#i-conciliación-de-sesiones-y-bloqueo-de-main-2026-11-01)
conserva ese resultado histórico y documenta el diagnóstico y las comprobaciones
de esta política, aprobada por el responsable del proyecto el 2026-11-01.

Se emplean las etiquetas de certeza del [índice de contexto](../README.md):
**Verificado**, **Inferido**, **No determinado** y **Documentado pero no
verificado**. La aprobación del núcleo y los controles todavía propuestos se
distinguen en 2.1 y 4; su existencia operativa no se deduce de la presencia de
documentación.

No se dispone de evidencia de lectura del entorno Azure desplegado dentro de este alcance. No se inspeccionaron recursos Azure, no se enviaron credenciales de prueba a sistemas remotos y no se realizaron pruebas de explotación. La [segunda validación histórica](../audits/SECOND_PASS_VALIDATION.md) aporta antecedentes, pero sus afirmaciones sobre interceptor, expiración, ausencia de contratos y estado de Fase II deben contrastarse con esta base posterior.

### Evidencia que fundamenta la propuesta

| Referencia | Evidencia y certeza | Consecuencia para el diseño |
|---|---|---|
| E1 | **Verificado:** [AuthTokenService](../../app/frontend/src/app/core/auth/auth-token.service.ts) decodifica el payload y comprueba `exp`; [GoogleAuthService](../../app/frontend/src/app/features/auth/services/google-auth.service.ts) obtiene `sub` y `email` sin verificación criptográfica ni intercambio HTTP. La [prueba de sesión](../../app/frontend/src/app/features/auth/services/google-auth.service.spec.ts) construye un token sintético con `alg: none` y firma ficticia. | Se puede representar una identidad visual con claims fabricados. **No determinado:** que las APIs remotas acepten esa credencial o permitan acceso indebido a datos. La prueba existente se inspeccionó; no se volvió a ejecutar como parte de este ADR. |
| E2 | **Verificado:** el [interceptor](../../app/frontend/src/app/core/api/api-key.interceptor.ts) restringe origen/ruta, adjunta bearer y subscription key e invalida el token correspondiente ante 401. AuthTokenService ya programa la expiración. | No reabrir como fallos actuales la comparación por prefijo de origen ni la expiración solamente perezosa de la auditoría histórica. Estos controles de cliente no validan la firma. |
| E3 | **Verificado:** [ms-users](../../app/ms-users/README.md), [ms-catalog](../../app/ms-catalog/src/app.ts) y [ms-notifications](../../app/ms-notifications/src/markettec_notifications/main.py) implementan su fundación técnica. [HealthController](../../app/ms-users/src/main/java/com/markettec/users/adapters/in/web/HealthController.java), [pom.xml](../../app/ms-users/pom.xml), el router/middleware Express y el [adaptador FastAPI](../../app/ms-notifications/src/markettec_notifications/adapters/inbound/http.py) no implementan verificación Google/JWT ni autorización de negocio. | No hay autenticación backend implementada en estas fundaciones de `market_tec`; el dominio y persistencia independientes se distinguen en E11. Health, errores y documentación técnica no demuestran protección de futuros endpoints de negocio. Tampoco demuestran qué backend está conectado actualmente a Azure APIM. |
| E4 | **Verificado:** [ADR-001](ADR-001-distribucion-microservicios.md) es Accepted y fija ownership e identidad opaca; deja JWT/APIM fuera de su aprobación. [ADR-002](ADR-002-rol-express-backend.md) y [ADR-003](ADR-003-convencion-timestamps.md) son Proposed. | Auth pertenece a ms-users, sin cuarto servicio, sin acceso a bases ajenas y sin consulta síncrona a ms-users en cada autorización de catálogo. Este ADR no altera esos límites. |
| E5 | **Verificado:** el [contrato de identidad](../../contracts/identity/IDENTITY_CONTRACT.md) recomienda el intercambio y RS256/JWKS. [Users OpenAPI](../../contracts/openapi/users.json) es `draft-pending-team-approval`; `/v1/auth/google` está marcado `proposed` y `/health` está implementado. **Documentado pero no verificado:** la operación del flujo de intercambio recomendado. | Publicar borradores no aprueba sus parámetros ni implementa el intercambio. MTEC-15 exige revisión conjunta. |
| E6 | **Verificado:** [API_AND_EVENTS](../phase2/API_AND_EVENTS.md), sección `POST /auth/google`, contiene un ejemplo de respuesta cuyo primer segmento Base64URL se decodifica a `{"alg":"HS256","typ":"JWT"}`. [AZURE_INFRASTRUCTURE](../phase2/AZURE_INFRASTRUCTURE.md) conserva `jwt-secret`, `JWT_SECRET` y un ejemplo conceptual de APIM que referencia discovery Google. | La contradicción existe en ejemplos de diseño, aunque `HS256` no aparezca escrito literalmente. **Inferido:** esos nombres sugieren un secreto compartido. **No determinado:** algoritmo o claves realmente desplegados; no hay evidencia de implementación HS256. |
| E7 | **Verificado:** [GOOGLE_LOGIN](../../app/GOOGLE_LOGIN.md) afirma validación backend y aceptación de cualquier dominio; [MICROSERVICES_ARCHITECTURE](../phase2/MICROSERVICES_ARCHITECTURE.md) conserva referencias a ADR-001 Proposed y a validación síncrona de usuario. | Hay desfases frente al código, ADR-001 y la propuesta de dominio institucional. Se registran aquí sin editar documentación ajena a este alcance. No usar esas frases como evidencia de controles desplegados. |
| E8 | **Verificado documentalmente en la revisión inicial:** [auditoría MTEC-12](https://allanaron06122005.atlassian.net/browse/MTEC-12?focusedCommentId=10025) y [seguimiento de segunda auditoría](https://allanaron06122005.atlassian.net/browse/MTEC-12?focusedCommentId=10027) del 2026-10-29 mantienen la alternativa interna sin aprobación y Azure no verificado. [MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36) define intercambio seguro; [MTEC-34](https://allanaron06122005.atlassian.net/browse/MTEC-34) lo precede mediante identidad interna. [MTEC-15](https://allanaron06122005.atlassian.net/browse/MTEC-15) distingue contratos publicados de aprobación pendiente. | Los tickets sustentan la necesidad y dependencias, no la eficacia de controles productivos. No se modifican tickets ni sus estados. |
| E9 | **Verificado:** [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) está In Progress, sin comentarios en la consulta posterior del 2026-11-01; bloquea MTEC-36 y exige revisión humana y aprobación explícita. Su descripción vigente registra la aceptación delimitada y la política de sesión; este ADR conserva T01–T18. | El ticket exige todavía conformidades y registro revisado. El merge documental no sustituye conformidades técnicas ni satisface el cierre de MTEC-40. |
| E10 | **Verificado en Jira, 2026-11-01:** MTEC-34 y MTEC-35 Done; MTEC-37 In Progress; MTEC-36 To Do, bloqueado por MTEC-40; MTEC-15 y MTEC-12 In Progress. **Documentado pero no verificado independientemente:** comentarios de MTEC-34/35 reportan dominio validado, PR #2 fusionado y 111 pruebas normales + 34 SQL; MTEC-37 reporta preparación y QA local; la subfase 2 confirma por GitHub REST el merge y el estado success del CI de `19ce9f1`, sin acreditar operación Azure. | Done de dominio/persistencia no acredita autenticación, permisos runtime/migrador, Managed Identity, migración Azure o APIM. MTEC-17 conserva su estado histórico Done; no se reabre. |
| E11 | **Verificado por inspección local de ms-users:** `650411b` contiene `UserService`, `Email`, `ExternalIdentityKey`, `AuthenticatedPrincipal`, `SqlUserStore` y Flyway `V1__initial_users_schema.sql`; `7f963a9` añade perfil `sql-appservice`, observabilidad y CI. Referencias exactas en 7.1. | Ya existe dominio/persistencia independiente, a diferencia de `app/ms-users`. `AuthenticatedPrincipal` local solo expone `userId()`; vinculación queda denegada por defecto y no hay verificador Google/JWT, sesiones o correo implementados en esas bases inspeccionadas. |

## 2. Alternativas consideradas

Los nombres A/B de esta sección designan las alternativas históricas sobre dónde validar Google, no los caminos de acceso de 3.1 ni las alternativas de distribución de servicios de ADR-001.

| Criterio | Alternativa A: Google ID Token validado en APIM | Alternativa B: Google verificado en ms-users y JWT interno |
|---|---|---|
| Firma y claims de entrada | APIM verificaría firma con claves Google, allowlist de algoritmo, emisor Google, audiencia/client ID autorizado, `exp` y demás claims requeridos. Un token Google no es automáticamente una credencial autorizada para cualquier API. | ms-users verificaría esos mismos elementos antes de resolver o crear identidad y emitir credencial interna. APIM y servicios aceptarían exclusivamente el perfil interno aprobado en rutas protegidas. |
| Obtención y rotación Google | APIM dependería de discovery/JWKS Google y de su caché/recuperación. Habría que probar rotación, `kid` desconocido e indisponibilidad. | Esa dependencia se concentra en el verificador Google de ms-users; APIM y servicios dependen además de las claves públicas internas. Se operan dos ciclos de claves distintos. |
| Asociación a usuario | `sub` Google no puede convertirse en `userId` por simple renombrado. Habría que diseñar cómo obtener un principal interno confiable desde el mapping de ms-users. No se propone consultar ms-users en cada request ni mover su mapping al gateway. | ms-users resolvería una vez por intercambio `(issuer, sub)` externo a `userId` opaco; el `sub` del JWT interno representaría ese `userId`. |
| Acoplamiento | Los validadores y la propagación de identidad quedan acoplados al proveedor, sus claims y vida útil. Restricciones de alta/dominio siguen requiriendo lógica de cuenta interna. | Los servicios consumen identidad de MarketTec; ms-users concentra integración Google y política de alta. Se puede cambiar proveedor sin transformar el identificador de recursos. |
| Frontera de confianza | APIM autenticaría una credencial externa, pero aún habría que proteger el backend, validar defensivamente y propagar una identidad interna no falsificable. | Fronteras separadas: Google acredita identidad externa; ms-users emite principal interno; APIM valida admisión; cada servicio valida y autoriza sus recursos. |
| Autorización y propagación | Ni el token Google ni headers del gateway sustituyen ownership, participación o capacidades. Los backends necesitarían reglas explícitas para traducir la identidad sin interpretar Google `sub` como ID interno. | JWT original interno reenviado, validación local y principal de aplicación. Los servicios no reciben Google ID Tokens ni inventan identidad con headers. Eventos transmiten referencias internas según contratos validados. |
| Coste y limitaciones | Menor operación de un emisor propio, pero no resuelve por sí sola mapping, cuentas ni autorización; forzar su resolución en cada llamada contradiría el límite de ADR-001. | Añade emisor crítico, custodia/rotación de claves, publicación JWKS, disponibilidad del intercambio, revisión de contratos y gestión de revocación. |

**Evaluación de la revisión — Inferido:** B ampliada sigue siendo la opción más adecuada al requisito de acceso sin Google y a ADR-001. A por sí sola no autentica el correo institucional ni materializa el mapping interno; añadirle otro emisor y traducción en gateway recuperaría gran parte del coste de B con dos perfiles de admisión. A sería reconsiderable si se retirara el requisito sin Google o se aprobara una plataforma externa que resolviera ambos métodos y el mapping, con otra revisión de coste/contratos. No hay evidencia que justifique cambiar ahora la dirección seleccionada.

La implementación de B, cuya arquitectura base queda aceptada en 2.1, queda
condicionada a capacidad real para operar firma/rotación, sesiones y correo,
responsables de incidentes y contratos aprobados. Si esa capacidad falta, se
mantiene el bloqueo; publicar una recomendación no permite degradar validaciones
ni habilitar rutas inseguras para continuar.

### 2.1. Arquitectura base aceptada y límites de aprobación

**Aceptación expresa del responsable del proyecto: 2026-11-01.** Se acepta la
alternativa B ampliada. A queda como antecedente evaluado; no es la base
seleccionada. La justificación de la sección 2 se mantiene: identidad
independiente del proveedor, acceso sin Google y autorización junto al recurso,
asumiendo el coste de operar el emisor, correo y sesiones.

| Núcleo Accepted | Decisión aprobada | Propietarios de su desarrollo y condición de implementación |
|---|---|---|
| Arquitectura e identidad | ms-users centraliza autenticación e identidad interna, JWT y sesiones; confianza compartida en emisor y claves públicas, sin compartir claves privadas ni bases. Se conservan los tres servicios de ADR-001, sin cuarto servicio de autenticación. | ms-users y tres servicios; perfil interoperable, contratos y custodia pendientes según 4/8. |
| Métodos de primera versión | MTEC-36 incluirá simultáneamente Google y correo institucional. Adaptadores o flujos independientes sobre casos de uso compartidos conducen a identidad interna única y al mismo sistema de sesiones. No fusionar por correo; vínculo con prueba reciente suficiente de ambos métodos. | ms-users/frontend; coordinar alcance vigente de Jira y cerrar P16/P18/P21 y contratos antes de implementar cada interfaz. |
| Elegibilidad básica | Posesión verificada de correo de estudiantec.cr, itcr.ac.cr o tec.ac.cr permite funciones básicas, sin exigir matrícula o empleo activo. Sin privilegios ni clasificación visible por dominio. | Funcional/ms-users/frontend; comparación exacta y prueba de buzón; continuidad del titular y recuperación pendientes, sin añadir otra barrera de afiliación al acceso básico. |
| Responsabilidades | ms-users verifica métodos, resuelve identidad, emite y renueva; APIM valida admisión y políticas generales; cada servicio revalida credenciales y autoriza ownership, participación y capacidades. | Responsables de servicios y APIM; mecanismos, excepciones y pruebas pendientes; APIM no sustituye autorización de negocio. |
| Comunicación | Solicitud del usuario con JWT interno por APIM al destinatario; trabajo interno con identidad de servicio y mínimo privilegio; eventos con identidad del productor, integridad y userId de negocio; delegación explícita y acotada cuando haga falta actuar por un usuario. | Servicios/APIM/SEG; protocolo y contratos por revisar. No reenviar indiscriminadamente JWT entre servicios ni consultar ms-users en cada autorización. |
| Sesión | Ventana renovable de 60 minutos, 30 minutos de inactividad y máximo absoluto de ocho horas desde el login inicial; vence el primer límite aplicable. Aviso previo y renovación solo mientras siga válida, verificados en servidor; renovar no reinicia el máximo absoluto. Al vencer se exige reautenticación. | ms-users/frontend/SEG; política B03 y perfil B05/B06 delimitados en §3.4.1; evidencia/protocolos pendientes; aviso a cinco minutos candidato. |

**Accepted no significa aprobación total de P01–P24**, conformidad de los
revisores técnicos, certificación de seguridad, aprobación de MTEC-15,
implementación completa autorizada de MTEC-36, configuración de Azure/APIM ni
finalización de MTEC-40. La autoridad de esta aceptación es exclusivamente el
responsable del proyecto; no se atribuyen acuerdos a los demás roles. Sus
revisiones siguen pendientes en 10.

ADR-001 conserva su aceptación del 2026-10-29. El repositorio independiente
existente de ms-users sigue documentado en 7.1; esta aceptación no resuelve el
corte de autoridad operativa/pipelines, no altera almacenamiento ni topología
productiva. Para cerrar MTEC-40 faltan las conformidades técnicas y de
seguridad, los acuerdos mínimos aún abiertos y el registro revisado exigido por
el ticket. No se crea PR ni se inicia MTEC-36 en esta ejecución.

## 3. Responsabilidades y perfil aprobados parcialmente; controles pendientes

El reparto siguiente pertenece al núcleo Accepted; sus mecanismos y valores
pendientes conservan el estado de la sección 4. Ningún requisito se presenta
como control ya implementado.

| Componente | Responsabilidades aceptadas |
|---|---|
| ms-users | Validación Google, verificación institucional, identidad interna, alta y vinculación, sesiones, emisión y renovación, publicación de claves públicas/metadata apropiada, revocación y logout según diseño aprobado. |
| APIM | Validar perfil JWT interno en la frontera, admisión general, acceso y abuso, enrutamiento y excepciones explícitas para login, renovación y metadata. Tabla de operaciones y controles efectivos pendientes. |
| Cada microservicio | Validar defensivamente firma y claims pertinentes; construir principal confiable; rechazar headers de identidad falsificados; autorizar ownership, participación y capacidades de sus propios recursos. |

No se comparten claves privadas ni bases de datos. Los servicios confían en el
emisor y sus claves públicas; no necesitan una consulta a ms-users por cada
autorización de negocio. Azure/APIM efectivos continúan no verificados.

### 3.1. Dos caminos de autenticación e identidad común

Ambos métodos forman parte de la primera versión de MTEC-36. Se diseñarán como
adaptadores o flujos independientes sobre casos de uso compartidos, con
identidad y sesiones comunes; no se crea otro microservicio. Los pasos
siguientes detallan el diseño futuro, sin aprobar rutas o payloads ni afirmar
implementación.

#### Camino A — Google Identity Services

1. Angular obtiene un Google ID Token mediante GIS.
2. Angular envía esa credencial a la futura API de autenticación mediante APIM; el login no requiere previamente un JWT interno.
3. `ms-users` verifica criptográficamente firma, algoritmo, issuer, audience, expiración y claims obligatorios, además de la vinculación al intento y elegibilidad aprobadas.
4. `ms-users` identifica la cuenta existente por vínculo Google exacto o registra la nueva con ID Token válido, correo verificado y dominio institucional exacto; emite sesión inmediata según la [decisión vigente de MTEC-15](DECISION_LOG.md#registro-google-institucional-vigente--2026-11-04), sin vincular cuentas automáticamente por correo.
5. Solo después de satisfacer la política aplicable, `ms-users` emite la credencial de MarketTec y establece la sesión propia de 3.4.
6. APIM y los servicios validan el JWT interno; los casos de uso consumen exclusivamente la identidad interna validada.

El Google ID Token es una credencial transitoria, nunca el identificador permanente de publicaciones, chats o perfiles. Google `sub` solo identifica el vínculo externo dentro de `ms-users`.

#### Verificación Google

ms-users usaría una biblioteca mantenida, con pruebas explícitas de firma, algoritmo admitido, emisor y audiencia Google, expiración, tipos de claims y ausencia de campos obligatorios. Las claves provendrían de endpoints Google configurados, con caché según sus metadatos y rechazo seguro si no existe una clave válida disponible. No se confiaría en `jku`, `x5u` o una URL suministrada por el token. El [verificador recomendado por Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) es la referencia para estos checks; decodificar no es verificar.

El mapping de identidad externa usaría `(issuer, sub)`, nunca correo como clave de cuenta. Si se admiten las dos representaciones oficiales del emisor Google, su normalización a un emisor canónico ocurriría **después** de validar contra la allowlist; la regla debe aprobarse y probarse para no crear cuentas duplicadas. Un vínculo existente prevalecería sobre cambios de correo. No se vincularían cuentas distintas automáticamente por coincidencia de email.

La admisión Google también aplicaría la allowlist institucional descrita abajo.
Se exigiría `email_verified` booleano verdadero y, cuando se use como evidencia
Google Workspace, `hd` firmado y perteneciente a la allowlist Workspace
aprobada, con su relación al dominio del correo definida por funcional; el
parámetro `hd` del botón no demuestra pertenencia. Para registro Google nuevo,
la decisión vigente de MTEC-15 acepta ID Token válido con `email_verified=true`
y dominio institucional exacto, sin enlace adicional. Magic Link corresponde
exclusivamente al método independiente de correo y permanece sin implementar. Esto no impone registro de
nuevo a cuentas existentes. No se impondría Google
Workspace al camino de correo sin Google. Ninguno de esos claims demuestra por
sí solo matrícula o empleo activo.

Para cuentas nuevas se recomienda alta idempotente después de validar identidad
y elegibilidad, con unicidad del mapping y resolución transaccional de
concurrencia. La posesión verificada del correo autorizado basta para
elegibilidad básica; el mecanismo de alta idempotente y las reglas técnicas de
continuidad/vinculación requieren aprobación, sin exigir prueba externa de
matrícula o empleo. MTEC-34 define el dominio y puertos; este ADR no elige motor
de persistencia.

#### Perfil mínimo Google para deliberación (P18/P21; Proposed)

| Elemento | Propuesta y prueba de aceptación |
|---|---|
| Firma y claves | Solo RS256, como anuncia el [discovery Google](https://accounts.google.com/.well-known/openid-configuration); biblioteca mantenida y firma obligatoria. Obtener JWKS del destino Google configurado (`https://www.googleapis.com/oauth2/v3/certs` en metadata consultada), TLS, caché conforme a Cache-Control y refresco limitado ante `kid` desconocido. Rechazar `none`, RS/HS, clave ajena y caída sin clave válida; no usar `tokeninfo` por request como verificador de producción. |
| Emisor/cliente | Allowlist de `accounts.google.com` y `https://accounts.google.com`; canonicalizar a la segunda forma solo después de verificar. `aud` debe corresponder al client ID configurado para ese entorno/intento; no admitir todo cliente de la organización. Inventario exacto de client IDs/orígenes: **No determinado**, pendiente frontend/ms-users. Proponer una única audiencia igual al client ID del intento y rechazar inicialmente arrays/múltiples audiencias hasta aprobar su perfil. Si aparece `azp`, comprobar su tipo y coincidencia exacta con el cliente autorizado para ese intento, también con una sola audiencia; no basta que pertenezca a la organización. Revisar con [OIDC Core, validación de ID Token](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation). Probar cliente/presentador ajenos y formas de emisor. |
| Tiempo/intento | `sub`, `iss`, `aud`, `iat`, `exp` obligatorios con tipos y coherencia; validar `nbf` si llega. Propuesta de skew compartido en P11. Nonce generado por servidor, 256 bits aleatorios y TTL de 5 min, asociado a cookie de preautenticación protegida según P23, propósito, client ID e intento; igualdad exacta con claim y consumo atómico antes de emitir. Rechazar nonce ausente, expirado, de otro navegador o repetido. El soporte GIS de [nonce](https://developers.google.com/identity/gsi/web/reference/js-reference#nonce) no implementa por sí solo esta correlación. |
| Cuenta/errores | Después de firma, intento y P16: resolver `(issuer canónico, sub)`; alta idempotente si se aprueba. Conflicto por correo no vincula ni fusiona. Probar dos altas simultáneas, correo cambiado y misma pareja ya existente: un único mapping/userId. Credencial inválida: 401 genérico; solicitud malformada: 400; proveedor indisponible sin clave: error temporal sin sesión, semántica final MTEC-15. No devolver claims/tokens en errores. |

Las cifras de desafío son propuestas para limitar replay y retención de estado; necesitan aprobación y prueba de usabilidad. No se equipara la vida del token Google al máximo de 240 s del JWT interno: la frescura del login se acota con el intento. La verificación de correo/`hd` y elegibilidad descrita arriba sigue siendo obligatoria según P16; el identificador externo nunca sustituye al `userId`.

#### Camino B — Correo institucional sin Google

1. El usuario introduce su correo institucional en Angular.
2. La solicitud pasa por APIM; el backend verifica el dominio exacto contra la allowlist aprobada y configurada.
3. `ms-users` solicita prueba de posesión enviando un enlace de acceso de un solo uso al buzón; no exige cuenta Google ni contraseña institucional.
4. El usuario abre el enlace y confirma explícitamente el intento de acceso.
5. El backend valida el secreto contra su verificador almacenado, la integridad del estado asociado, expiración y vinculación al correo, propósito e intento. Consume el enlace atómicamente una sola vez.
6. Solo tras esa prueba y la política P16 aprobada, `ms-users` crea o resuelve la identidad interna del método. Recuperar una identidad existente por correo también está sujeto a la política de buzones reasignados descrita abajo; el enlace solo prueba posesión actual. Si existe una cuenta por otro método, exige la vinculación descrita abajo.
7. Se emite la misma credencial interna de MarketTec y se establece una sesión propia, independientemente del método inicial.

Requisitos de seguridad para la futura implementación:

- Prevenir enumeración con respuestas y tiempos comparables para cuentas existentes/inexistentes, sin revelar su método de acceso.
- Limitar solicitudes de emisión, reenvío y validación por intento, destinatario y origen de red; prevenir abuso de envío sin bloquear cuentas por peticiones anónimas.
- Generar tokens aleatorios criptográficamente seguros, con entropía suficiente y vencimiento breve. Duración exacta y límites se aprobarán en P18.
- Almacenar verificadores de forma segura, por ejemplo un hash del secreto aleatorio; proteger estado, propósito, destinatario, expiración e intento. No almacenar el token utilizable en claro ni elegir aquí el motor de persistencia.
- Validar y consumir atómicamente para que dos confirmaciones concurrentes no creen dos accesos; rechazar tokens alterados, expirados, ajenos al intento o ya consumidos.
- Proteger frente a escáneres automáticos de correo: una apertura GET o previsualización no consume el secreto ni crea sesión. Exigir confirmación explícita mediante una operación protegida y vinculada al intento; el protocolo entre dispositivos queda por aprobar en P18.
- Usar HTTPS y destinos de enlace configurados y confiables; impedir redirecciones arbitrarias, fugas por referente y analítica de terceros en la confirmación. El enlace de correo transporta un secreto efímero; nunca se coloca un bearer de API o renovación en una URL.
- No registrar tokens ni enlaces sensibles en frontend, APIM, servidor, proveedor de correo, trazas o errores; redactar también URL/query y cookies. Requerir reautenticación reciente para operaciones sensibles.

Se adaptan los controles de tokens de un solo uso de [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) al enlace de acceso; esa referencia no define el protocolo de login de MarketTec. La mitigación de escáneres y el consumo atómico son requisitos del diseño que necesitan pruebas propias.

Verificar el correo acredita **control del buzón**, no necesariamente matrícula
o empleo activo. Ese control en uno de los tres dominios aprobados es suficiente
para acceso básico; no se exige verificación externa de afiliación. La
continuidad de una cuenta histórica y su recuperación siguen pendientes y no
autorizan nuevas barreras de matrícula o empleo.

#### Allowlist institucional común

La allowlist aprobada contiene **exactamente** `estudiantec.cr`, `itcr.ac.cr` y
`tec.ac.cr`. La posesión verificada de un correo de cualquiera de esos dominios
permite acceder a las funciones básicas de MarketTec, sin verificación externa
de matrícula o empleo activo. Esta decisión documental no habilita registro en
código.

No se infieren ni conceden roles privilegiados por dominio ni se muestra una
clasificación de estudiante o funcionario por ese dato. No se almacenarán
atributos de afiliación sin caso de uso de negocio que los justifique. No se
elimina ningún atributo existente del dominio sin autorización.

La futura comparación usaría el dominio extraído de un correo validado, con normalización definida y uniforme. Se prohíben sufijos ambiguos, coincidencias parciales, comodines, subdominios implícitos y dominios similares: `estudiantec.cr.example.org` y `otroestudiantec.cr` no equivalen a `estudiantec.cr`. Añadir cualquier otro dominio institucional requeriría configuración y aprobación explícita. No se añade validación funcional al código.

#### Identidad interna y vinculación

**Una persona puede tener varios métodos de autenticación, pero debe conservar un único `userId` interno.** El modelo es conceptual, sin aprobar esquema de datos ni modificar contratos:

```text
User
 ├── userId: usr_12345 (ejemplo, no formato aprobado)
 ├── correo institucional verificado
 ├── GoogleIdentity (opcional)
 └── EmailIdentity (opcional)
```

El ID es opaco, estable y generado exclusivamente por `ms-users`; no se deriva del correo ni de Google `sub`, no cambia al añadir métodos y se comparte como referencia lógica entre servicios. El mismo método verificado recupera el mismo usuario incluso ante concurrencia; cambiar un correo o añadir un proveedor no reasigna el ID.

No se fusionan cuentas automáticamente por coincidencia de correo. Vincular métodos exige una operación autenticada y prueba de control reciente de **ambos métodos**, prevención de replay y comprobación de conflictos. Si un método ya pertenece a otra cuenta, no se crea otra identidad ni se fusionan usuarios silenciosamente; se exige resolución explícita. El procedimiento de recuperación/conflictos y las reglas para correos reasignados están pendientes en P16. No se promete deduplicar personas solo por sus direcciones.

#### Parámetros de correo y recuperación para deliberación (P16/P18; Proposed)

| Decisión | Alternativas y recomendación razonada | Riesgo y prueba necesaria |
|---|---|---|
| Dominio/alta/elegibilidad | Accepted: allowlist exacta y posesión verificada suficientes para acceso básico, sin prueba de matrícula/empleo ni privilegios por dominio. Proposed: protocolo de alta idempotente y continuidad de cuentas. | No confundir elegibilidad básica con continuidad del titular histórico. Registro aún no implementado. Probar los tres dominios, parecidos, subdominios, correo no probado y ausencia de privilegios/clasificación por dominio. |
| Secreto y caducidad | Recomendar 32 bytes CSPRNG (256 bits), Base64URL, TTL inicial 10 min frente a códigos cortos/plazos mayores. Guardar SHA-256 del secreto de alta entropía, nunca secreto en claro, junto con correo normalizado, propósito, intento y expiración. | Equilibra entrega tardía y ventana de robo, sujeto a medición. No aplicar hash rápido a contraseñas. Probar aleatoriedad/tamaño, vencimiento con reloj controlado, alteración y ausencia de secretos persistidos/logueados. |
| Enumeración y tasa | Mismo acuse genérico y procesamiento comparable para toda dirección sintácticamente válida, registrada o no. Propuesta piloto: 3 envíos/15 min por destinatario, espera de 60 s entre reenvíos y 20 solicitudes/15 min por origen; 5 confirmaciones fallidas por intento. Combinar límite global de envío y presupuesto pendiente de APIM/correo. | Valores ajustables, pendientes de pruebas de carga/NAT y aprobación; no bloquear una cuenta por tráfico anónimo ni revelarla con 429 selectivo. Probar cuentas existentes/inexistentes, destinatarios rotatorios, ráfagas y red compartida. |
| GET/consumo/reenvío | GET muestra confirmación, sin consumir ni crear sesión; POST protegido comprueba intento, prueba y caducidad con consumo transaccional único. Reenvío idempotente durante cooldown; nuevo enlace invalida el anterior para el mismo intento después de autorizar reenvío. | Escáner, carreras y respuesta perdida. Dos confirmaciones producen como máximo una sesión; reintentar no emite otra. Si la respuesta se pierde tras consumo, reiniciar autenticación; entrega fallida no consume como éxito ni crea usuario. |
| Dispositivos | Recomendar confirmar en el navegador que inició el intento, ligado por cookie aleatoria HttpOnly/Secure y control CSRF; alternativa cross-device requiere protocolo adicional aprobado. Un navegador distinto reinicia allí el flujo, sin trasladar sesión con el enlace. | Reduce login CSRF por enlaces compartidos; limita comodidad. Probar escáner/preview, cookie ausente, navegador ajeno y enlace reenviado. Sin bloqueo duro por IP o user-agent. |
| Recuperación y conflictos | Para vincular: sesión del usuario actual con reautenticación de máximo 5 min y prueba reciente del método nuevo; sin unión por email. Si ya hay método/correo en conflicto, detener alta/vínculo y resolver de forma explícita sin revelar cuenta. Si no controla ningún método, no hay recuperación automática; RP/funcional debe aprobar prueba alternativa y responsable antes de ofrecerla. | El código actual no garantiza persona única ni correo único entre métodos. No convertir nuevo control de buzón reasignado en acceso a cuenta histórica. Probar pérdida de método, cambio de correo, conflicto y baja; bloquear vínculo que ya pertenece a otro userId. |

**B02 aprobado, protocolos bloqueantes P16:** un enlace nuevo y el mismo correo
no acreditan titularidad histórica tras reasignación. El RP aprueba passkeys
ligadas al userId y códigos de recuperación de un uso como continuidad independiente,
opcionales para básico. No entregar historial sin prueba previamente establecida
y verificada ni fusionar/transferir por email. Si falta prueba, permitir básico
aislado solo tras aprobar su protocolo/namespace/perfil inicial, sin borrar la
cuenta anterior. Recuperación excepcional requiere procedimiento aprobado;
no prometer restitución automática ni convertir pérdida permanente en política.
WebAuthn, enrolamiento, custodia e independencia real aún necesitan diseño y
pruebas; no se cambian esquemas ni se inventan endpoints aquí.

**Reautenticación pendiente P16/P18:** `iat` reciente y nonce válido acreditan emisión/correlación del intento, no necesariamente autenticación interactiva reciente del usuario en Google. Antes de habilitar vínculos u operaciones sensibles, definir qué prueba y reloj satisfacen los 5 min propuestos para cada método; evaluar `auth_time`/`max_age` solo si el flujo elegido los soporta y verifica, o una prueba adicional aprobada. Una cookie MarketTec o un callback GIS silencioso no se declaran prueba suficiente por sí solos.

Estos valores son propuestas de piloto, no reglas institucionales acreditadas. `Email` del repositorio independiente normaliza solo el dominio y conserva mayúsculas, puntos y alias de la parte local; aprobar esa regla sin inferir equivalencias Gmail. El namespace de `EmailIdentity` necesita revisión con MTEC-15: no inventar un Google `sub` para correo ni una nueva clave contractual aquí.

### 3.2. Emisión y validación interna

**Perfil aprobado por RP el 2026-11-02 (B05/D1): RS256 con RSA-2048**,
clave privada bajo custodia exclusiva de ms-users y solo claves públicas para
validadores. ES256, otros tamaños o HMAC no son alternativas autorizadas por
esta aprobación. La selección concreta del custodio productivo sigue pendiente.

Claims obligatorios: `iss`, `aud`, `sub = userId` interno opaco, `sid`, `iat`,
`exp` y `jti`. `kid` es obligatorio en el **encabezado JOSE**, nunca como claim.
Se exige validación estricta de firma, algoritmo, emisor, audiencia delimitada
por entorno/validador y tiempos; no aceptar Google como bearer de negocio ni
claves o URLs aportadas por un token no confiable. Los valores exactos de
issuer/audience, forma final del perfil y validación interoperable siguen
pendientes. `typ=at+jwt`, NumericDate entero, `nbf` opcional y restricciones de
shape siguen siendo diseño Draft del contrato, sin aprobar ADR-003 general.
No incluir PII sensible; una firma no cifra el contenido. Una clave pública no
permite emitir tokens. Ver [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html).

APIM rechazaría credenciales ausentes o inválidas en rutas protegidas y comprobaría firma, emisor, audiencia, tiempo y perfil autorizado. La forma de imponer la allowlist se debe demostrar con las capacidades reales de `validate-jwt`, tipos de claves, condiciones adicionales y pruebas negativas; no se supone un atributo de algoritmo inexistente. Cada adaptador backend repetiría la verificación con su configuración aprobada y construiría el principal conceptual del contrato de identidad, sin que dominio o casos de uso dependan de HTTP/JWT.

El flujo conceptual de autorización sería:

```text
Usuario autenticado → JWT MarketTec validado → AuthenticatedPrincipal
                    → userId interno → Operación de negocio autorizada
```

`ms-catalog` obtendría el vendedor de una publicación desde el principal autenticado, nunca desde `sellerUserId`, `senderUserId`, `vendedorId`, `senderId` u otro campo del navegador como prueba de identidad. El ID solo identifica al actor; cada operación aún debe comprobar ownership, participación y autorización del recurso. `ms-notifications` conserva sus reglas propias de acceso y destinatario.

Los servicios aplicarían ownership y capacidades al caso de uso: perfil propio en ms-users; vendedor, participante de chat y emisor de mensaje en ms-catalog; destinatario autenticado en ms-notifications. Una ruta o body selecciona un objeto, pero no acredita su propietario. La emisión de un JWT corresponde a autenticación; la autorización de objetos permanece en el servicio dueño. Un fallo de autenticación produciría 401; un principal válido sin permiso, 403 o la política de ocultación 404 que se acuerde. No se cambia aquí ningún contrato de errores.

### 3.3. JWKS, custodia y rotación

Como opción de despliegue se recomienda evaluar una clave asimétrica no exportable en Azure Key Vault con identidad administrada y permisos mínimos de firma para ms-users, frente a otro custodio aprobado. La elección sigue sujeta a compatibilidad, coste y aprobación; no es requisito para desarrollar localmente con claves efímeras (5.1). APIM y los demás servicios recibirían únicamente la parte pública. Ninguna clave privada, token o secreto de producción se copiaría a Git, frontend, fixtures o logs. No se reutilizaría la clave JWT como certificado mTLS.

La publicación seguiría el formato [JWK/JWKS de RFC 7517](https://www.rfc-editor.org/rfc/rfc7517.html), sin material privado. Con `openid-config`, APIM necesita metadata de discovery compatible que indique el `jwks_uri`; una URL de JWKS sola no sustituye esa metadata. B05/D2 aprueba JWKS público y aprovisionamiento controlado de material público para APIM y validadores; el procedimiento, frescura y propagación requieren pruebas; este ADR no crea endpoints ni afirma que ms-users sea un proveedor OIDC completo. Metadata y claves públicas deben ser alcanzables por los validadores sin necesitar un JWT que dependa de esas mismas claves, evitando un ciclo de arranque.

La rotación normal propuesta sería: publicar la nueva clave pública, esperar y verificar propagación a todas las cachés, comenzar a firmar con el nuevo `kid`, mantener la anterior mientras puedan existir tokens válidos y retirarla después. El plazo depende de vida máxima del token, skew, cachés y solicitudes en vuelo; no se fija un intervalo definitivo. Microsoft documenta caché y limitación de refresco en [validate-jwt](https://learn.microsoft.com/en-us/azure/api-management/validate-jwt-policy), por lo que no se debe suponer invalidación inmediata. Ante `kid` desconocido se limitarían los refrescos para evitar denegación de servicio y se rechazaría si no puede validarse. Una clave pública conocida puede seguir verificando tokens vigentes durante una caída solo dentro de una política de caché acotada y aprobada.

Un compromiso exige un procedimiento distinto de rotación normal: detener firma comprometida, publicar reemplazo, retirar confianza y forzar rechazo de claves/tokens afectados en **todos** los validadores, incluido APIM con caché. Se necesitan responsables, auditoría y pruebas de recuperación; retirar una clave del JWKS no demuestra por sí solo revocación inmediata.

### 3.4. Expiración, renovación, revocación y replay

**Política funcional Accepted, aprobada por el responsable del proyecto el
2026-11-01, común a ambos métodos:** ventana renovable de **60 minutos**,
expiración tras **30 minutos de inactividad** y máximo absoluto de **ocho horas
desde el login inicial**. Vence el primero de los tres límites aplicables.
Angular advertirá antes de ese vencimiento efectivo de sesión (no del JWT) y ofrecerá continuar únicamente
mientras la sesión siga válida. Avisar **cinco minutos antes** es una propuesta
UX; su anticipación exacta no está aprobada.

| Concepto | Estado y significado |
|---|---|
| Ventana de sesión | 60 minutos renovables aprobados; no equivalen a vigencia de cada credencial. |
| Inactividad | 30 minutos desde actividad elegible respaldada por servidor, según B03 (§3.4.1); no prueba humanidad. Protocolo y pruebas pendientes. |
| Máximo absoluto | Ocho horas desde el login inicial, aprobadas. Ninguna renovación, refresh o actividad reinicia ese origen ni amplía el máximo. |
| Vencimiento efectivo | El primero entre fin de ventana vigente, última actividad elegible respaldada por servidor + 30 minutos y login inicial + ocho horas; la revocación puede invalidar antes. |
| JWT de acceso | B01/D3 y B05/D3: nominal máximo 240 s, condicionado a demostrar deadlines y residual ≤300 s; sustituye candidato histórico de 900 s. |
| Renovación | Solicitud válida del usuario antes del vencimiento efectivo; servidor verifica sesión, usuario y credencial, además de controles seguros por diseñar. |

El servidor verifica expiración e inactividad y rechaza la renovación al llegar
a cualquiera de los límites, aunque Angular conserve estado visual o envíe
peticiones. Los sondeos, heartbeats y renovaciones automáticas no acreditan
actividad humana ni mantienen viva una sesión por sí solos. B03 aprueba actividad elegible respaldada por servidor, instante real y cómputo
único, con procesamiento tardío máximo de 60 s sin reactivar sesiones. Su
evidencia, reloj y coordinación requieren diseño; el navegador no fija la hora.

Si el usuario solicita continuar **antes del vencimiento efectivo**, el backend
solo podrá conceder otra ventana de **hasta 60 minutos**, siempre acotada por el
máximo absoluto de ocho horas y por el timeout de inactividad aplicable. Una
solicitud de renovación no reinicia por sí sola el reloj de actividad humana.
No se renuevan sesiones expiradas, revocadas o comprometidas. Al vencer el
límite
aplicable, el servidor invalida la sesión y exige autenticación nueva por Google
o correo institucional; un clic no constituye reautenticación. Un JWT de acceso
vencido puede renovarse únicamente con sesión y credencial de renovación aún
válidas; no se confunde expiración de JWT con expiración de sesión.

La ratificación del 2026-11-01 aprueba los límites de 30 min/8 h que antes
figuraban como propuesta y luego pendientes; no acredita implementación.
P10/P11/P15/P23 conservan condiciones técnicas de §3.4.1. Los mecanismos
siguientes combinan política aprobada y detalles Proposed, sin acreditar
implementación ni aprobación de las interfaces MTEC-15.

**Política C de refresh replay: Approved para MarketTec v1 el 2026-11-04 por el responsable del proyecto**, según [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) y el [documento de decisión](../../docs/MTEC40_REFRESH_REPLAY_DECISION_PROPOSAL.md). Toda generación consumida se rechaza sin gracia ni reemisión; la pareja histórica refresh + CSRF coincidente se clasifica internamente como replay y debe producir auditoría sin secretos. La respuesta pública al refresh inválido o consumido es `401 REFRESH_INVALID`. Un replay aislado no revoca automáticamente a la generación ganadora. La revocación corresponde a logout autorizado, recuperación conforme a protocolo aprobado o compromiso confirmado con evidencia independiente y autorización registrada. IP, User-Agent, Origin o repetición aislada no atribuyen por sí solos compromiso. Ninguna rotación reactiva sesiones vencidas ni amplía indebidamente los límites 60/30/8.

La aprobación de política no acredita auditoría estructurada, revocación por incidente operativa, pruebas entre instancias, comportamiento Angular, políticas APIM ni el presupuesto de exposición JWT ≤300 s. La alternativa C evita revocaciones incorrectas, pero acepta menor contención automática que B: un atacante que gane la primera rotación puede conservar la nueva generación hasta expiración o revocación efectiva; el replay no identifica al actor legítimo. Una respuesta perdida después del commit puede requerir reautenticación, y revocar refresh no invalida JWT ya emitidos. El CSRF no es una segunda prueba criptográfica independiente cuando `/v1/auth/session` puede recuperarlo con cookie válida y controles HTTP. La respuesta de revocación al reuse descrita en [RFC 9700 §4.14.2](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2) para tokens OAuth rotatorios es más estricta; C no se declara conforme con esa pauta. La candidata del [PR #25](https://github.com/a-calderon-org/market_tec/pull/25) alinea contrato e identidad con esta política; MTEC-15/B07 y las conformidades siguen pendientes.

B06/D4 aprueba refresh opaco rotatorio en cookie `HttpOnly`, `Secure`, host-only (sin Domain); `SameSite`/Path requieren validación de topología. Nombre, ámbito, duración y elección Lax/Strict o necesidad justificada de None están pendientes; None requeriría Secure. B06/D4–D5 aprueban access JWT y sincronizador CSRF solo en memoria, protección CSRF y CORS con orígenes explícitos coherentes con cookies; sus protocolos concretos siguen Draft. SameSite no sustituye CSRF; HttpOnly no elimina XSS. Atributos y límites se revisarán conforme a [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), sin introducir secretos en Angular ni en documentación.

La sesión interna no demuestra vigencia permanente de identidad externa o elegibilidad institucional. No se asume que Google ID Token pueda renovarse indefinidamente y **nunca se utiliza como refresh token interno**. Una sesión agotada/revocada o una operación sensible exige reautenticación mediante el método habilitado, conforme a P10/P16/P20.

El borrado de sesión del navegador o `disableAutoSelect()` no revocan un bearer ya emitido. `jti` aporta trazabilidad y una posible clave de revocación, pero no evita replay ni revoca nada por su mera presencia. Sin control compartido, una cuenta deshabilitada o token robado puede seguir siendo aceptado hasta su expiración efectiva bajo las cotas demostradas. B01/D1 limita la exposición ordinaria a ≤300 s verificables; el mecanismo sigue pendiente D5, con alcance coherente en gateway y servicios y sin introducir consultas a ms-users por request contra ADR-001.

Para el intercambio se recomienda un desafío de servidor con nonce vinculado al intento de login y de un solo uso, verificado en el token Google y consumido atómicamente. GIS permite [configurar nonce](https://developers.google.com/identity/gsi/web/reference/js-reference), pero generar uno solo en el navegador sin correlación/verificación server-side no resuelve replay. El contrato de desafío, su almacenamiento transitorio y tratamiento de reintentos están pendientes en P18; no existen actualmente ni se añaden aquí. Las defensas CSRF deben corresponder al modo GIS elegido: no se presupone que el callback JavaScript actual incluya automáticamente el mecanismo de cookie/body de un POST directo de GIS.

En las APIs, un bearer robado continúa siendo reutilizable durante su ventana de validez aunque el intercambio use nonce. Se proponen TLS, minimización de exposición, controles de frontend, vida breve y detección; protección criptográfica de posesión sería otro diseño por aprobar. No se promete eliminar replay con JWT, CORS o subscription keys.

#### Mecanismos de sesión: política aprobada y detalles Proposed

Sobre la ventana de 60 minutos aprobada se aprueba refresh opaco rotatorio; 256 bits sigue propuesta, con
verificador hash y familia persistida en `ms-users`; no reutilizar el ID token
Google. Los límites 60 min/30 min/8 h son Accepted; el mecanismo de actividad
y la reautenticación sensible siguen pendientes. Los 5 min de frescura de
vínculo de 3.1 siguen siendo una propuesta separada. Al confirmar login se
propone rotar el contexto previo para impedir fijación.

B06/D6 aprueba serialización incluso entre pestañas, sin gracia general.
La política C aprueba consumo y sustitución atómicos: una generación consumida
se rechaza sin reemisión; la pareja histórica refresh + CSRF coincidente se
clasifica internamente y debe auditarse sin secretos. Una generación desconocida
o CSRF distinto no confirma replay. La respuesta pública es
`401 REFRESH_INVALID`. Un replay aislado no revoca automáticamente la
generación ganadora. La auditoría estructurada, el protocolo de revocación
autorizada y las pruebas de concurrencia siguen pendientes. Ante respuesta
perdida después del commit, recuperar estado solo si llegó la cookie nueva;
con la generación anterior se exige reautenticación. No se acepta gracia ni
reintento con reemisión. El vencimiento de la ventana de sesión, del
máximo absoluto o del timeout de inactividad impide renovar y exige invalidación
de sesión en servidor; no invalida automáticamente el access JWT ya emitido.
P10/P15 deben diseñar cómo hacer efectivos los límites de sesión en todos los
validadores, mediante expiración de credenciales y/o controles de sesión por
aprobar, sin asumir que un JWT vigente autoriza una sesión vencida. No se
aprueba acceso residual después del vencimiento de sesión. Probar bordes de
60 min, 30 min de inactividad y ocho horas absolutas, sin atribuir corte
distribuido a mecanismos todavía no implementados. Logout revoca
la sesión/familia actual e invalida su cookie; «cerrar todas», baja y compromiso
revocan todas las sesiones del usuario. MTEC-15 debe acordar idempotencia y
respuestas.

**Ventana residual aprobada B01/D1–D3:** máximo ordinario verificable de
300 s desde revocación autoritativa hasta admisión protegida, con TTL nominal
≤240 s y cero tolerancia positiva de expiración B05/D3. Medir reloj, propagación,
colas y demora check–admisión; el presupuesto aritmético de 60 s no es skew
autorizado. Acotar `exp` al primer deadline con margen seguro; si no cabe,
reducir TTL o rechazar. Emisión/refresh después de revocación se rechazan.
**Documentado pero no verificado:** ninguna prueba end-to-end demuestra esta
cota. D4 sigue pendiente para efectos/entregas en vuelo; D5 para infraestructura
y contención crítica. Sustituye el candidato histórico 900 s + 30 s, que no es
política vigente. `sid`/`jti` y borrar cookies no propagan revocaciones.

El compromiso de la clave permite fabricar también tiempos y jti: esperar el TTL no basta mientras siga siendo confiable. El runbook propuesto detiene firma, sustituye clave y retira/bloquea el `kid` comprometido en cada validador con caché ya cargada; si no puede garantizarse, suspende rutas protegidas antes de reabrirlas con evidencia. Responsable operativo, SLA y mecanismo efectivo APIM están pendientes. Se requiere simulacro autorizado; no se promete rechazo inmediato con solo borrar la clave del JWKS.

#### 3.4.1. Consolidación de aprobaciones y pendientes — 2026-11-02

**Verificado:** lectura de la descripción vigente de [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40)
(In Progress, actualizada 2026-11-02 20:32:45 -06:00), contrastada con los informes
locales B01 §12–14, B02–B04 y B05/B06. Las cabeceras Proposed de estos dos últimos
son anteriores a las aprobaciones posteriores en Jira; no se acepta íntegramente
su redacción ni sus parámetros candidatos. Esta consolidación registra decisiones
ya aprobadas por RP; no crea aprobaciones nuevas ni conformidades de equipos.

| Bloque | Aprobado por RP | Condición o pendiente |
|---|---|---|
| Base / §2.1 | Arquitectura, Google y enlace institucional, userId opaco y sesiones 60/30/8 | Contratos Draft; conformidades B07 y controles reales pendientes |
| B01 D1–D3 | Residual ordinario máximo 300 s verificables; fail-closed si falta garantía; JWT nominal máximo 240 s condicionado a demostración | No hay cota operativa demostrada. Una caída de ms-users no invalida JWT localmente verificables con confianza/reloj vigentes; impide login/refresh dependientes de él |
| B01 D4/D5 | **Sin aprobar** | Operaciones en vuelo/corte de entrega y efecto sensible; infraestructura mínima, incidentes críticos y contención. A+B local es propuesta, sin selección de tecnología |
| B02 | Passkeys ligadas a userId y códigos de recuperación de un uso para continuidad; opcionales para básico; sin fusión/transferencia automática de historial | WebAuthn, independencia real, enrolamiento, alta básica aislada, namespace, perfil inicial, custodia y recuperación excepcional requieren protocolo/contrato aprobado. No hay endpoints nuevos |
| B03 | Actividad de negocio elegible respaldada por servidor, instante real de ejecución, cómputo único; procesamiento tardío ≤60 s sin reactivar sesiones vencidas | Evidencia autenticada/correlación, allowlist, reloj y atomicidad sin demostrar. Polling/refresh no cuentan; actividad solo mueve inactividad, nunca ventana/absoluto |
| B04 | Dirección condicionada de prueba reciente verificable para acciones sensibles | Frescura <300 s sigue condicionada; JWT/GIS válido o iat reciente no acreditan interacción reciente. Evidencia por método, acción y consumo único pendientes |
| B05 D1 | RS256/RSA-2048; iss/aud/sub/sid/iat/exp/jti; kid JOSE, validación estricta | Issuer/audience y perfil exactos por entorno, interoperabilidad y pruebas negativas pendientes |
| B05 D2 | Privada solo ms-users; JWKS público y públicas aprovisionadas a validadores; procedimiento de rotación/caché/retirada/emergencia | Custodio/topología, tiempos de frescura/propagación y cutoff crítico por ensayar; retirar JWKS no purga cachés |
| B05 D3 | ≤240 s, exp acotado a 60/30/8, cero leeway positivo a expiración | Relojes/márgenes y residual ≤300 s por demostrar; no asignar skew concreto |
| B06 D4 | Access y CSRF solo en memoria; refresh opaco rotatorio en cookie HttpOnly/Secure/host-only | Nombres, SameSite, Path y hosts reales requieren contrato/pruebas; no persistir credenciales en almacenamiento web |
| B06 D5 | Sincronizador CSRF, preferencia same-site y CORS explícito | Orígenes/métodos/headers/credenciales/rutas y topología real pendientes; sin wildcard con credenciales |
| B06 D6 | Refresh serializado entre pestañas sin gracia general; carreras/pérdida explícitas; logout/revocación servidor y bloqueo de emisión posterior | Protocolo concreto de concurrencia/reconciliación y pruebas pendientes. Aviso candidato 300 s antes del deadline efectivo de sesión, nunca del JWT |
| B07 | **Sin conformidades registradas en esta revisión** | Responsables ms-users, Angular, APIM, otros servicios y SEG deben revisar compatibilidad y consumo de versión canónica |

**No determinado:** márgenes de reloj, topología, infraestructura y tiempos reales.
**Inferido:** viabilidad del modelo de deadlines con margen; requiere pruebas.
No se autoriza iniciar autenticación real ni operar Azure mediante esta tabla.

### 3.5. Resolución propuesta de contradicciones

| Evidencia contradictoria | Resolución propuesta, sin modificar el documento dueño |
|---|---|
| Identidad recomienda RS256/JWKS; el JWT sintético de respuesta de API_AND_EVENTS declara HS256 en su header codificado. | Concretar el perfil asimétrico de la arquitectura B aceptada; retirar posteriormente el ejemplo HS256 o marcarlo sustituido. El ejemplo no prueba un emisor HS256 implementado. |
| AZURE_INFRASTRUCTURE usa `jwt-secret` y `JWT_SECRET`. | Sustituir posteriormente la receta por referencias y permisos de la clave asimétrica aprobada, publicación de claves públicas y runbook. No interpretar un nombre de variable como evidencia del algoritmo desplegado. |
| El ejemplo APIM referencia discovery Google para «Google o interno». | Separar validación Google en ms-users de validación interna en rutas de negocio APIM. Documentar issuer/audience/discovery internos y excepciones de intercambio/metadata cuando se aprueben. |
| GOOGLE_LOGIN afirma backend verificador, IDs derivados de Google y cualquier dominio; el código no hace el intercambio y los contratos proponen identidad opaca/admisión institucional. | Corregir después el flujo implementado y la política realmente aprobada. No afirmar hoy verificación remota ni decidir dominios por un ejemplo. |
| Fase II conserva ADR-001 Proposed, validación síncrona de usuario y respuestas antiguas con envelope/campos distintos de Users OpenAPI. | Prevalecen ADR-001 Accepted y el estado draft del contrato versionado. Tras revisión conjunta, alinear prosa y ejemplos con el contrato aprobado, sin fallback a Google `sub` ni llamada por request. |
| Contrato de identidad contempla renovar demostrando Google o diseñar refresh después; Users OpenAPI solo propone intercambio Google y no describe correo, sesiones ni vinculación. | La arquitectura base aceptada selecciona sesiones propias comunes con límites 60 min/30 min/8 h de 3.4. MTEC-15 debe revisar la ampliación y compatibilidad antes de implementar; el borrador versionado sigue siendo la referencia contractual vigente y no se amplía por este ADR. |
| ADR-002 propone directorios internos; ya existe dominio/persistencia en `ms-users-market-tec`. | La referencia histórica a repositorio futuro queda corregida en 7.1. Conservar el scaffold sin nuevos cambios de negocio; coordinar autoridad, mapa y workflows en tarea posterior, sin editar ADR-002 aquí. |
| MTEC-34 conserva el alcance histórico Google; MTEC-36 ya registra ambos métodos y la política de sesiones, aunque su título siga centrado en Google. | La ampliación funcional consta en Jira; faltan acuerdos técnicos y contratos antes de desarrollarla, sin modificar Jira. MTEC-17 sigue Done; su endurecimiento no implementa JWT interno ni se reabre por este diseño. |

## 4. Parámetros y decisiones pendientes

Las filas siguientes conservan alternativas y trazabilidad de la revisión previa.
Su estado se concilia con las aprobaciones delimitadas de §3.4.1; una aceptación
parcial no aprueba parámetros candidatos ni conformidades. RP es responsable del
proyecto; SEG es la revisión de seguridad, cuya designación nominal sigue
**No determinado**. Roles y asignaciones no acreditan aprobación.

Hitos acumulativos: **I (categoría A del QA)** = acuerdo mínimo para implementar interoperablemente MTEC-36; **F (categoría B)** = cierre de contrato/parámetro e integración frontend/consumidores; **D (categoría C)** = evidencia antes de desplegar un sistema protegido en Azure. La **categoría D del QA** identifica detalles diferibles con rol propietario e hito de revisión propuesto; no equivale al hito D de despliegue. Todas las filas aplican a D; la presencia en F no exige migrar Angular antes de I. «Diferible» describe solo el detalle indicado y un plazo propuesto por hito, nunca un aplazamiento aprobado. El responsable de la fila prepara ese pendiente; falta asignación nominal y fecha calendario en el acta de la sección 10.

| Decisión | Alternativas reales | Decisión base y recomendación pendiente | Riesgos | Pruebas necesarias | Bloqueo y detalle diferible con plazo propuesto | Responsable de aprobación | Estado |
|---|---|---|---|---|---|---|---|
| P01. Estrategia | A: Google en APIM; B: métodos en ms-users y JWT propio | B ampliada aceptada: Google y correo institucional simultáneos en primera versión; identidad/sesiones comunes en ms-users, conforme a 2.1 | Emisor/sesiones/correo críticos y coste operativo | Ambos métodos → mismo userId tras vínculo legítimo; sin dependencia de Google para correo (T13/T17/T18) | Elección resuelta; I/F/D mantienen acuerdos técnicos y contratos de las demás filas | RP aprobó arquitectura el 2026-11-01; tres servicios, frontend, APIM y SEG pendientes de revisión técnica | Accepted: núcleo 2.1; sin conformidades técnicas atribuidas |
| P02. Algoritmo | RS256; ES256; HMAC | B05/D1: RS256/RSA-2048 aprobado; verificadores solo públicos | Confusión RS/HS, coste de firma o soporte desigual | Java/Node/Python y APIM: RS válido, none/HS/clave ajena rechazados (T02/T03) | I/F/D: perfil aprobado; demostrar interoperabilidad y custodio antes del hito correspondiente | RP + ms-users, APIM, SEG | Accepted: RS256/RSA-2048; interoperabilidad/custodio pendientes |
| P03. Issuer | URI HTTPS por entorno; identificador lógico | URI HTTPS estable y exacta. Fixture aislada `https://identity.dev.markettec.invalid`; no es URL desplegada ni discovery operativo | Mezcla de entornos, cambio de emisor | Issuer exacto aceptado; otro entorno/sufijo rechazado (T04) | I: regla/configuración; F/D: URI real antes de integrar entorno, ms-users/APIM | RP + ms-users, APIM, consumidores | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P04. Audience | Una API; por servicio | Una audiencia por entorno, fixture `markettec-api-dev`; no comodines. Reduce complejidad inicial | Reutilización entre servicios; no sustituye ownership | Aud ajena/ausente rechazada; token propio no autoriza recurso ajeno (T04/T10) | I: semántica; F/D: valor real antes de integrar entorno, servicios/APIM | RP + tres servicios, APIM, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P05. Sub/userId | Interno opaco; externo/correo | `sub = userId` interno estable; mapping `(issuer,subject)` solo ms-users. Formato local usr_ + UUIDv4 no obliga al consumidor | Confusión de namespaces, duplicados por método | Mapping concurrente, cambios de email, vínculo y consumidores opacos (T13/T18) | I/F/D; formato de transporte revisado con MTEC-15 antes de I | RP + tres servicios, ms-users, MTEC-15 | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P06. Iat | Obligatorio; opcional | Obligatorio NumericDate entero en segundos; `iat ≤ ahora + skew`, edad/duración máxima acotadas | Milisegundos, emisión futura | Tipos, límites, futuro y duración incoherente en cada validador (T05) | I/F/D; sin diferir semántica | RP + ms-users, APIM, consumidores | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P07. Nbf | Omitir; obligatorio | Proposed: omitir inicialmente; si existe, validar tipo, coherencia iat ≤ nbf < exp y no aceptar antes | Validadores desiguales o aceptación prematura | Sin nbf válido; nbf futuro o incoherente rechazado (T05) | I/F/D; sin diferir regla | RP + ms-users, APIM, consumidores | Proposed: obligatoriedad/perfil exacto pendiente |
| P08. Exp | Obligatorio; opcional | Obligatorio, entero en segundos; `exp > iat`, `0 < exp - iat ≤240 s`, exp acotado al primer deadline y cero leeway positivo B05/D3 | Acceso indefinido o excesivo | Ausente, tipo inválido, expirado y borde sin leeway positivo; desfase medido (T05/T06) | I/F/D; todo cambio de vida requiere coherencia P10 | RP + ms-users, APIM, consumidores | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P09. Jti | UUIDv4/aleatorio; ausente | Obligatorio aprobado B05/D1; formato aleatorio/UUID y entropía aún Draft, sin PII; no revoca por sí solo | No evita replay por sí mismo; logs correlacionables | Unicidad, obligatoriedad y replay no tratado como autorización (T06/T11) | I/F/D; retención operativa antes de D, SEG/observabilidad | RP + ms-users, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P10. Acceso/sesión | Límites 60 min/30 min/8 h seleccionados; acceso ≤240 s aprobado condicionado; protocolos por evaluar | Accepted: ventana renovable 60 min, inactividad 30 min, máximo absoluto ocho horas desde login inicial sin reinicio por refresh; vence el primer límite; aviso previo, renovación solo válida y expiración en servidor. Sondeos automáticos no son actividad humana. Accepted delimitado: ≤240 s, transporte/serialización B06 y actividad B03; Proposed: aviso 300 s/protocolo, entropía y mecanismos restantes | Robo, actividad falsificada, carrera, respuesta perdida y más logins | Bordes 60 min/30 min/8 h, renovación próxima al máximo sin reiniciarlo, sondeos sin actividad, sesión revocada, pestañas, carrera/reuso/logout (T06/T18) | I: cómputo seguro de actividad, renovación/anti-replay, cumplimiento de límites y reauth sensible; F: UX/transporte; D: evidencia | RP aprobó límites el 2026-11-01; frontend, ms-users y SEG pendientes de revisión técnica | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P11. Skew | 0/30/60 s o medido | B05/D3: cero tolerancia positiva a expiración; márgenes de reloj/admisión medidos sin valor inventado | Hasta 30 s extra o falsos rechazos | Bordes ±30 s, desfase real y tipos (T05) | I/F/D; medición y ajuste antes de F/D, infra/validadores | RP + APIM, infra, servicios | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P12. JWKS/kid/discovery/tipo | Metadata + JWKS; claves aprovisionadas | JWKS público sin privados, kid obligatorio, `typ=at+jwt` interno; metadata mínima compatible para APIM, sin declarar OIDC completo | SSRF, caché, ciclo de arranque o confusión de tipo | kid desconocido/duplicado, jku hostil, caída, clave privada ausente, Google rechazado en negocio (T04/T12/T15) | I: perfil/publicación; F: URLs/cachés y compatibilidad; D: prueba real. URLs productivas antes de F, ms-users/APIM | RP + ms-users, APIM, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P13. Rotación | Manual controlada; automatizada | Publicar/prepropagar antes de firmar; mantener anterior hasta último exp + skew y evidencia de cachés; emergencia bloquea kid o tráfico | Retirada prematura o confianza persistente en comprometida | Nueva/anterior, caída y compromiso con cachés calientes (T12/T15) | I: estrategia normal/emergencia coherente con P12/P15; F: protocolo/cachés compatibles; D: automatización/cadencia y SLA, ms-users/infra | RP + ms-users, infra/APIM, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P14. Custodia/firma | Key Vault + MI; otro custodio; clave exportable | Local: clave efímera aislada por proceso/prueba. Azure: evaluar no exportable + permiso mínimo de firma, sin compra/SKU aprobados | Coste/latencia, permisos excesivos y dependencia externa | Verificador no firma; fallo de custodio no emite; runtime sin exportar/administrar clave (T11/T12) | D; custodio/SKU/permisos diferibles hasta antes de D, infra/ms-users; aislamiento local mínimo desde I | RP + infra, ms-users, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P15. Revocación | Expiración; denylist distribuida; versión difundida; introspección | B01/D1–D3: ≤300 s ordinarios verificables, ≤240 s nominales y deadlines estrictos; fail-closed condicionado; D4/D5 y demostración pendientes, sin consulta por request | Logout/baja no invalidan bearer; compromiso no limitado por TTL | Baja, logout/reuso, emergencia y límites de sesión efectivos en todos los validadores (T06/T12/T18) | I: semántica/ventana; F/D: mecanismo probado; SLA/difusión antes de D, servicios/APIM/SEG | RP + tres servicios, APIM, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P16. Alta/dominios/vínculo | Elegibilidad básica resuelta; mecanismos de alta, continuidad, vínculo y recuperación por evaluar | Accepted: estudiantec.cr, itcr.ac.cr, tec.ac.cr exactos y posesión verificada suficientes para básico; sin matrícula/empleo, roles ni clasificación por dominio; sin fusión por email y vínculo con prueba reciente de ambos. Proposed: alta idempotente, continuidad y recuperación | Buzón reasignado, exclusión o duplicación; no garantiza persona única | Dominio exacto, no elegible, colisiones entre métodos, pérdida/recuperación y reauth ambos (T13/T17/T18) | I/F/D: implementar política aceptada; continuidad de cuenta histórica y protocolos pendientes antes de I; recuperación alternativa puede excluirse antes de F, RP/funcional. Sin exigir afiliación externa para básico | RP + funcional, ms-users, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P17. Acceso directo | Restricciones; mTLS; privado según plan | Negocio solo por APIM y backend revalida JWT; elegir control de origen compatible con capacidades/coste reales | Host/slot alternativo o certificados no verificados | Acceso directo incluso con JWT válido bloqueado; origen gateway inválido rechazado (T07/T08/T09) | I: negocio vía APIM, backend revalida JWT y origen no se acredita por headers del navegador; F: interfaz de confianza compatible; D: control Azure concreto y evidencia, infra/APIM. No bloquea fakes locales | RP + infra/APIM, servicios, SEG | Accepted parcial: frontera y revalidación; Proposed: protección de origen/acceso directo |
| P18. Replay/desafíos/enlaces | Nonce server; bearer sin vínculo; enlace/código | Google nonce 256 bits/5 min; correo 256 bits/10 min, SHA-256, consumo atómico y navegador iniciador; tasas piloto en 3.1 | Enumeración, CSRF login, escáner, reenvío y carrera | Nonce ajeno/repetido, GET no consume, TTL, dos confirmaciones y abuso/NAT (T06/T16/T17) | I/F/D; tasas globales y proveedor antes de F, ms-users/frontend/APIM; cross-device excluido salvo protocolo aprobado | RP + ms-users, frontend, MTEC-15, SEG | Proposed |
| P19. Principal/headers | JWT reenviado; aserción adicional; headers | Accepted: JWT interno del usuario vía APIM y revalidación/principal confiable en destinatario; headers falsificados no acreditan identidad. Proposed: saneamiento detallado y shape; trabajo interno usa identidad de servicio y delegación explícita cuando corresponda | Header de identidad o actor de body tomado como autoridad | X-User-Id/roles falsos con/sin bearer no cambian actor; ownership propio/ajeno (T07/T10/T13) | I/F/D; shape adicional del principal con MTEC-15 antes de F, servicios | RP + APIM, tres servicios, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P20. Scopes/autorización | Ownership inicial; capacidades; roles amplios | Accepted: ownership/participación/capacidades en servicio dueño, sin privilegios por dominio. Proposed: matriz exacta de recursos/capacidades antes de integrar | BOLA/IDOR y exceso de permisos; claim obsoleto | Acceso propio permitido, ajeno denegado sin efectos y capacidades exactas (T10) | F/D; catálogo de capacidades diferible hasta F, responsables de dominio; mínimo ownership desde I por P19 | RP + tres responsables de dominio, SEG | Accepted parcial: autorización de negocio; Proposed: matriz de capacidades |
| P21. Perfil Google | Un client ID/entorno; múltiples; normalizar emisor | RS256, issuers oficiales exactos, aud/client ID del intento, tiempo, nonce y elegibilidad; normalizar después de verificar según 3.1 | Cliente ajeno, duplicado por iss, hd/email mal interpretados | Firma/iss/aud/tiempo/nonce inválidos y email/hd según política; mismo mapping en variantes iss (T02–T06/T13/T16) | I/F/D; client IDs reales antes de F, frontend/ms-users; fakes aislados desde I | RP + ms-users, frontend, SEG | Proposed |
| P22. Excepciones APIM | Negocio; login/enlace/refresh/metadata; health | Excepción exacta por método/operación sin JWT previo solo donde corresponda; prueba propia/CSRF/tasa; health mínimo sin detalles | Wildcard o herencia evita autenticación; ciclos de login/JWKS | Negocio requiere JWT; access vencido solo renueva con sesión/refresh vigentes; sesión expirada requiere nueva autenticación; preflight acotado; metadata sin ciclo (T09/T15/T17) | I: clases de operación y prueba propia sin JWT previo, sin ciclos; F: tabla exacta método/ruta y contrato; D: políticas efectivas, APIM/ms-users/MTEC-15 | RP + APIM, ms-users, SEG | Accepted parcial: clases de excepción; Proposed: rutas, pruebas y políticas |
| P23. Navegador/cookies/CSRF/CORS | sessionStorage; memoria+cookie; topologías same/cross-site | Acceso en memoria; cookies de renovación/preautenticación host-only HttpOnly/Secure, Path y SameSite explícitos; origen exacto + token CSRF ligado a sesión/intento. Lax para same-site; None solo si justificado por topología y probado | XSS, CSRF y cookies de terceros bloqueadas; CORS no autentica | Cross-origin permitido/prohibido, CSRF ausente/ajeno, expiración y cookie por navegador (T11/T16/T18) | I: transporte y CSRF; F/D: hostname/path/SameSite/orígenes reales antes de F, frontend/APIM/ms-users | RP + frontend, ms-users, APIM, SEG | Accepted parcial según §3.4.1; detalles y evidencia pendientes |
| P24. Subscription key/logs | Clave de cuota pública; privilegio; señales usuario/red | Clave SPA pública, sin privilegio de usuario; cuota/abuso aparte de JWT, logs sin bearer, cookies, enlaces, PII o claves | Agotamiento de cuotas/coste y fuga por telemetría | Clave sola no autentica; señuelos ausentes de logs/trazas; límites de abuso (T11/T14/T17) | D; cuotas, alertas y retención antes de D, APIM/infra; redacción y límites básicos desde I | RP + APIM, frontend, infra, SEG | Proposed |

**Estado vigente:** consultar §3.4.1 para aprobaciones delimitadas y condiciones.
El recuento histórico de filas Proposed no equivale al estado posterior de B01–B06.
Quedan contratos/conformidades B07, parámetros y garantías operativas por demostrar;
los roles/hitos de esta matriz no son plazos comprometidos ni excepciones aprobadas.

## 5. Fronteras de confianza: arquitectura aceptada, controles pendientes

El reparto y los tipos de comunicación están **Accepted** en 2.1. El flujo es
lógico; protocolos, cookies y controles concretos del diagrama siguen
**Proposed**. Autenticación y renovación pasan por APIM. Login no requiere JWT
interno previo; renovación exige credencial de sesión y controles propios,
aunque el JWT de acceso haya expirado. Negocio exige JWT interno. No se aprueban
rutas HTTP ni políticas concretas.

```mermaid
sequenceDiagram
    participant G as Google / GIS
    participant A as Angular
    participant P as Azure APIM
    participant U as ms-users / Auth
    participant M as Microservicio dueño
    participant D as Datos propios
    participant B as Buzón institucional
    alt Camino A: Google
        G-->>A: Google ID Token
        A->>P: Credencial Google e intento
        P->>U: Login por conexión protegida
        U->>G: Obtener claves si la caché lo requiere
        U->>U: Verificar Google, intento y elegibilidad
    else Camino B: correo sin Google
        A->>P: Solicitud con correo institucional
        P->>U: Solicitud limitada y sin enumeración
        U->>U: Verificar dominio exacto autorizado
        U-->>B: Enlace efímero de un solo uso
        B-->>A: Usuario abre enlace y confirma intento
        A->>P: Confirmación protegida del intento
        P->>U: Prueba de posesión
        U->>U: Validar y consumir enlace atómicamente
    end
    U->>U: Resolver/registrar userId sin fusión por correo
    U-->>P: JWT interno y credencial de sesión propia
    P-->>A: Acceso y cookie de renovación protegida
    opt Renovación de sesión MarketTec
        A->>P: Cookie de renovación y protección CSRF
        P->>U: Renovación con control propio
        U->>U: Validar sesión y rotar credencial atómicamente
        U-->>P: Nuevo JWT y cookie de reemplazo
        P-->>A: Credenciales renovadas
    end
    A->>P: Bearer JWT interno
    P->>P: Validación criptográfica y políticas
    P->>M: JWT original y headers saneados por conexión protegida
    M->>M: Validación defensiva y autorización de recurso
    M->>D: Operación autorizada sobre datos propios
    D-->>M: Resultado
    M-->>P: Respuesta
    P-->>A: Respuesta
```

| Frontera | Confianza propuesta y control necesario | Límite de la garantía |
|---|---|---|
| Navegador → ms-users mediante APIM | HTTPS; prueba Google o de buzón, cuenta y anti-replay antes de emitir; renovación con sesión propia, rotación y CSRF. Límites de tamaño/tasa y errores sanitizados. | Estado Angular, CORS y subscription key no autentican al usuario; un nonce no impide el uso de un bearer interno robado después. |
| ms-users → Google | Endpoints configurados, TLS, caché acotada, validación de claves/claims. | La caída o rotación Google puede impedir nuevos intercambios; no se relaja validación para mantener disponibilidad. |
| ms-users → buzón institucional | Enlace efímero a dominio autorizado; proveedor y transporte de correo por aprobar, sin tokens en logs. | Control de buzón no demuestra matrícula/empleo; entrega fallida no crea sesión y escáner no consume enlace. |
| ms-users → verificadores internos | Clave privada aislada; metadata y JWKS públicos con integridad, disponibilidad y destinos de confianza configurados. | Publicar claves no aprueba issuer/audience ni resuelve revocación inmediata. |
| Angular → APIM en negocio | Validación completa del JWT interno, política específica por operación y control de abuso. | Autenticar la llamada no autoriza el objeto solicitado. |
| APIM → App Services | HTTPS con autenticación de origen y aislamiento de acceso directo aprobados. APIM elimina headers de identidad entrantes y reenvía JWT; backend lo valida. | Headers como `X-User-Id`, `X-Roles` o un certificado reenviado no son evidencia suficiente por sí mismos. CORS/DNS no aíslan el backend. |
| Adaptador → dominio → datos | El adaptador crea un principal validado; caso de uso comprueba ownership/participación/capacidad y accede solo a su almacenamiento. | No confiar en IDs del body/ruta como identidad; no consultar bases de otro servicio ni ms-users por cada request. |
| Servicios y eventos | El productor obtiene IDs de un contexto autorizado; consumidor valida contrato, procedencia y permisos del transporte según diseño independiente. | Un evento o `recipientUserId` no es un bearer de usuario ni autoriza acceso arbitrario. Este ADR no diseña identidad de workloads ni autenticación SSE. |

Para App Service deben evaluarse restricciones de acceso y conectividad según plan real, además de autenticación del origen gateway. La [guía de restricciones de acceso](https://learn.microsoft.com/en-us/azure/app-service/app-service-ip-restrictions) y la [guía mTLS](https://learn.microsoft.com/en-us/azure/app-service/app-service-web-configure-tls-mutual-auth) son referencias de capacidad, no evidencia del entorno. Solicitar un certificado no prueba que la aplicación valide cadena/confianza, vigencia y cliente autorizado; un header de certificado solo puede usarse dentro de una frontera de proxy protegida y saneada. La combinación concreta se mantiene abierta en P17 y no cambia topología aquí.

### Comunicación interna aceptada

- Solicitudes del usuario: JWT interno a través de APIM y revalidación por el
  servicio destinatario. Este trayecto no autoriza su retransmisión arbitraria a
  otros servicios.
- Trabajo interno: identidad de servicio específica con permisos mínimos, sin
  reutilizar la sesión de un usuario como identidad técnica.
- Eventos: autenticar productor y proteger integridad; userId es dato de negocio
  cuando corresponda, no credencial ni prueba de autoridad.
- Actuación por un usuario: delegación acotada y explícita solo ante un caso de
  uso real. Protocolo, alcance, audiencia y pruebas requieren revisión con
  MTEC-15/SEG antes de implementarse.

No reenviar indiscriminadamente JWT de usuarios entre microservicios. Las
identidades de servicio y la delegación no comparten claves privadas ni bases;
su implementación y configuración Azure siguen pendientes.

### 5.1. Compatibilidad de desarrollo y Azure (Proposed)

| Área | Evidencia y límite | Propuesta para revisión |
|---|---|---|
| Desarrollo aislado | **Verificado:** `ms-users@650411b` conserva almacén in-memory; MTEC-37 separa perfiles local y SQL. No se requiere Azure para revisar este ADR. | Futuros tests JWT/Google/JWKS con claves CSPRNG efímeras, reloj fijo y servidores/fakes locales; correo capturado en memoria/sumidero local sin entrega. Deshabilitar credenciales/destinos Azure y envío real en pruebas; issuer/audience separados y nunca aceptados en despliegue. No se implementa aquí. |
| Azure for Students / SQL | **Documentado pero no verificado en esta revisión:** documentación MTEC-35 registra suscripción Students y sonda SQL de lectura; no acredita runtime. La [oferta SQL](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-tier?view=azuresql) distingue cuota gratuita, pausa al agotarla y sobreconsumo facturable; Students Starter no equivale a Students. | Antes de D, infra debe acreditar elegibilidad/oferta efectiva, límites y pausa sin sobreconsumo; pruebas/cargas de firma, logs, conexiones y probes no deben consumir Azure por defecto. No se vuelve a decidir almacenamiento productivo en MTEC-40. |
| App Service F1 | Los [planes Free/Shared](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans) tienen cómputo compartido/cuotas y no escalan horizontalmente. [VNet Integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration) exige cómputo dedicado y resuelve salida, no aislamiento de entrada. **No determinado:** plan/capacidades efectivos del entorno. | F1 se evalúa como desarrollo, sin promesa de disponibilidad de emisor/JWKS. Considerar arranque en frío, cuotas y cachés; no exigir B1, VNet o private endpoints como compra aprobada. Si F1 no sostiene controles/disponibilidad, mantener piloto local o presentar alternativa/coste al RP antes de exponer negocio. |
| Runtime y migraciones | **Verificado estáticamente en `7f963a9`:** perfil sql-appservice usa Managed Identity explícita y no ejecuta Flyway; eso no prueba [MI real](https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity) ni permisos. | Identidades separadas: runtime solo DML necesario sobre datos propios, sin DDL/administración; migrador privilegiado controlado, fuera del arranque/pipeline ordinario. No reutilizar administrador o Azure CLI local como identidad de producción. Acreditar pruebas de permisos positivos/negativos en MTEC-37 antes de D. |
| Custodio y presupuesto | Key Vault es una opción, con [costes por operaciones/tipo de clave](https://azure.microsoft.com/en-us/pricing/details/key-vault/) y dependencia de permisos/conectividad; no consta aprobación de SKU ni de MI de firma. | Comparar Key Vault/otro custodio, latencia, volumen, fallos, rotación y coste total. Firma local efímera solo en entorno aislado. Aprobar presupuesto/operador/runbook antes de D; no añadir servicios facturables para desarrollo local. |
| APIM y orígenes web | **No determinado en Azure:** políticas efectivas, aislamiento y hosts. El código no acredita SameSite ni CORS desplegados. | Inventariar hostnames/orígenes por entorno antes de F. Static Web Apps y dominio azure-api.net pueden ser cross-site: Lax no garantiza refresh por fetch. Evaluar entrada same-site frente a None+Secure con CSRF y prueba de bloqueo de cookies de terceros; no degradar HttpOnly/Secure por conveniencia ni cambiar topología sin aprobación. |

Para caché/rotación, [Microsoft documenta](https://learn.microsoft.com/en-us/azure/api-management/validate-jwt-policy) consulta de configuración/JWKS cada hora y recuperación limitada a una vez cada 5 min ante clave faltante/fallo, con intervalos sujetos a cambio. Son referencias de capacidad, no mediciones del entorno. No fijar SLA de emergencia suponiendo que una eliminación JWKS vacía esa caché. Las pruebas de P12/P13/P15 deben incluir estados calientes y fríos del gateway.

## 6. Modelo de amenazas

Activos: mappings y cuentas, claves de firma, credenciales de usuario, recursos de cada dominio, disponibilidad y trazabilidad. Se consideran navegador/controlador HTTP hostiles, atacantes con un token propio o robado y compromiso de claves/infraestructura. Las condiciones son escenarios a prevenir, **no explotaciones confirmadas**. Todas las pruebas de esta tabla están pendientes; no se han realizado ataques remotos.

«Pendiente local/Azure» significa que el control requiere implementación y pruebas locales, más comprobación posterior de despliegue. «No determinado en Azure» no afirma exposición ni protección del servicio real.

| Amenaza | Condición de explotación | Impacto | Control preventivo propuesto | Detección propuesta | Componente responsable | Prueba necesaria | Estado de verificación |
|---|---|---|---|---|---|---|---|
| T01. Token falsificado | Un validador confía en payload o clave no autorizada | Suplantación y acceso si además falta autorización | Verificación criptográfica y perfil exacto antes de crear principal | Conteo de rechazos por causa y alertas de anomalías, sin tokens | ms-users, APIM y adaptadores de servicios | JWT fabricado con claims plausibles: 401, sin emitir credencial ni alcanzar caso de uso protegido | E1 verifica aceptación visual por inspección de código/prueba; aceptación API **No determinado** |
| T02. `alg: none` o confusión RS/HS | Se acepta firma ausente o algoritmo elegido por el atacante | Principal falso | Allowlist única por perfil, firma requerida, tipo de clave/algoritmo vinculado | Métrica de algoritmo rechazado | Verificador Google, APIM y servicios | Rechazar `none`, firma vacía y HS256 firmado con bytes de clave pública RSA; incluir token RS256 válido como control | Escenario backend pendiente local/Azure; fixture visual `none` verificado en E1 |
| T03. Firma inválida | Payload/firma alterados o clave de otro emisor | Alteración de identidad o permisos | Biblioteca verificada, clave del emisor configurado; no consumir claims como autoridad antes del éxito | Rechazos de firma y `kid` desconocido | ms-users, APIM y servicios | Alterar un byte, usar clave ajena y `kid` inexistente: rechazo sin procesamiento de negocio | Pendiente local/Azure |
| T04. `aud`/`iss` incorrectos y sustitución de tipo | Token genuino de otro cliente, entorno o proveedor se acepta | Confusión de destinatario o identidad | Allowlists exactas por perfil/entorno; separar Google e interno | Métricas por perfil inválido, con valores sanitizados | ms-users, APIM y servicios | Tokens válidamente firmados con aud/iss erróneos; Google en negocio e interno en intercambio; prueba de emisor canónico | Pendiente local/Azure |
| T05. Expirado, prematuro o tiempo incoherente | Se omiten `exp`/`nbf`, tipos o límite temporal | Extensión de acceso o bypass de vigencia | `exp` obligatorio, skew acotado, `iat`/`nbf` coherentes y duración máxima | Monitoreo de reloj y motivos temporales de rechazo | Emisor, validadores e infraestructura | Bordes de `exp`/skew, `nbf` futuro, `iat` futuro, ausencia/tipos inválidos, segundos frente a milisegundos | Temporizador cliente verificado estáticamente; controles backend pendientes |
| T06. Replay de credenciales | Robo/reenvío del ID token o bearer aún vigente | Login repetido, suplantación y operaciones repetidas | Nonce de servidor de un solo uso para intercambio; TLS, vida breve y política P15/P18; idempotencia por caso de uso cuando corresponda | Intentos repetidos, desafío consumido y anomalías de sesión sin registrar credenciales | ms-users, frontend, APIM y servicios | Dos intercambios concurrentes con mismo desafío; reintento aprobado; bearer robado durante/después de ventana y revocación | Pendiente; replay bearer residual explícito, `jti` no lo evita |
| T07. Headers de identidad falsificados | Navegador envía `X-User-Id`/roles y backend los toma como autoridad | Suplantación o elevación | Eliminar/sobrescribir headers y derivar principal del JWT revalidado; verificar origen gateway | Alertas de headers prohibidos sin copiar su contenido sensible | APIM y adaptadores backend | Header ajeno con token propio/ausente: no cambia principal; llamada directa no obtiene confianza | Pendiente local/Azure |
| T08. Acceso directo a App Services | Hostname/slot/IP admite tráfico externo por fuera de frontera aprobada | Omisión de gateway y mayor superficie de ataque | Aislamiento/red y autenticación de origen por aprobar; revisar hosts alternativos y excepciones técnicas | Logs de acceso denegado y origen inesperado | Infraestructura/APIM y servicios | Intento autorizado a hostname directo, alternativos y slot: bloqueo aun con JWT válido; probar sin origen/certificado válido | **No determinado en Azure** |
| T09. Omisión de políticas APIM | Operación/API/producto/herencia o excepción deja ruta sin validación | Entrada de credencial inválida o bypass de cuotas | Revisar políticas efectivas y herencia por todas las operaciones; excepciones mínimas de login/metadata | Trazabilidad gateway/backend, rutas sin validación y divergencias de configuración | Responsable APIM y seguridad | Matriz de rutas protegidas con token ausente/inválido; backend de negocio no invocado; login/metadata sin ciclo de autenticación | **No determinado en Azure** |
| T10. Acceso a recurso de otro usuario | Token válido, pero se confía en IDs de ruta/body o solo en firma | BOLA/IDOR, lectura o modificación ajena | Ownership/participación/capacidad en cada caso de uso; IDs de actor derivados del principal | Denegaciones de acceso y patrón de enumeración con datos mínimos | Servicio dueño de perfiles, catálogo/chats o notificaciones | Usuario A intenta leer/modificar objetos restringidos de B; 403/404 sin efecto y acceso propio permitido | Sin endpoints de negocio en fundaciones locales; dominio independiente con ownership probado según reporte, no adaptador autenticado; pendiente local/Azure |
| T11. Tokens/claves en logs | Request/response, headers, excepciones, trazas o almacenamiento cliente exponen secretos | Robo de sesión o de clave, fuga de datos personales | Redactar Authorization, credential, cookies, enlaces/query y material privado en toda la cadena; no bearer de API/renovación en URL; acceso/retención mínimos | Revisión automática con credenciales señuelo y alertas de secretos | Frontend, servicios, APIM y observabilidad | Capturar logs/trazas/error con señuelos; comprobar ausencia de tokens completos y material privado | No hay auditoría de logs desplegados; pendiente local/Azure |
| T12. Compromiso o rotación incorrecta de claves | Permisos excesivos, clave filtrada o caché desalineada | Emisión maliciosa o caída masiva de validación | Custodia mínima, separación por entorno/uso, precarga de clave y runbook de compromiso | Auditoría de firma/cambios de claves y errores por `kid` | ms-users, infraestructura, APIM y seguridad | Solapamiento de claves, caída JWKS, `kid` nuevo, retirada normal y compromiso con cachés precargadas | Pendiente local/Azure; revocación inmediata no demostrada |
| T13. Confusión Google `sub` / `userId` | Se usa correo/sub externo como ID interno o fallback | Ownership erróneo, cuentas duplicadas o vinculadas indebidamente | Mapping único `(issuer, sub)` solo en ms-users; `sub` interno opaco, sin fallback | Conflictos de mapping y cambios de vínculo auditados sin exponer claims | ms-users y responsables de contratos/consumidores | Mismo sub de emisor distinto; correo cambiado; concurrencia; consumidores no interpretan Google sub; sin acceso a bases ajenas | Regla de ADR-001 verificada; implementación pendiente |
| T14. Abuso de subscription key del navegador | Se extrae la clave pública SPA y se trata como autenticación/privilegio | Consumo de cuota/coste o acceso si la clave concede privilegios | No otorgar identidad/roles por clave; JWT y autorización independientes; cuotas y límites de abuso | Métricas por usuario autenticado y origen de red con umbrales acordados | APIM, frontend e infraestructura | Reutilizar clave sin JWT válido: rechazo en negocio; no obtiene privilegios ni omite controles de abuso | Exposición inherente al cliente verificada; permisos/cuotas **No determinado en Azure** |
| T15. Sustitución/abuso de JWKS | Se siguen URLs del token, metadata manipulada o refrescos ilimitados | SSRF, aceptación de clave hostil o denegación de servicio | Destinos fijados, TLS, tipos/uso/algoritmo de clave, límites y caché acotada | Picos de refresco, fallos de metadata y cambios auditados | Verificadores, APIM e infraestructura | `jku`/`x5u` hostiles ignorados; `kid` aleatorio masivo limitado; JWKS sin claves privadas | Pendiente local/Azure |
| T16. Login CSRF o extracción por XSS | Intento de login no vinculado o script accede al bearer | Sesión de cuenta incorrecta o robo de token | Vinculación de intento, CSRF según modo GIS, controles de origen y prevención XSS; almacenamiento P23 | Intentos de desafío inválido, señales CSP y pruebas con señuelos | Frontend, ms-users, APIM y seguridad | Login desde origen no permitido y desafío ajeno rechazados; revisar que el callback no presuponga cookie/body GIS; evaluación XSS separada | Pendiente; sessionStorage actual accesible a JavaScript |
| T17. Abuso o consumo indebido de enlace institucional | Enumeración, fuerza bruta, token filtrado, escáner GET o confirmaciones concurrentes | Acceso indebido, denegación o abuso de correo | Respuesta uniforme, límites, verificador seguro, vínculo al intento y consumo atómico tras confirmación | Métricas de emisión/rechazo/consumo sin secretos | ms-users, frontend, APIM y entrega de correo | Cuenta existente/inexistente indistinguibles; dominio similar rechazado; GET no consume; token alterado/expirado/repetido/ajeno rechazado; carrera produce un consumo | Pendiente local; correo no implementado |
| T18. Robo/replay de renovación o vinculación indebida | Cookie robada, CSRF, carreras de refresh o fusión por correo | Secuestro de sesión/cuenta | Rotación/revocación, detección de reutilización, CSRF y prueba reciente de ambos métodos para vincular | Alertas de reutilización/conflictos y auditoría mínima | ms-users, frontend, APIM y seguridad | Rotación concurrente/reintento, familia revocada, sesión expirada; vínculo sin prueba de un método rechazado; mismo userId tras vínculo legítimo | Scaffold local sin sesiones; ms-users independiente implementa rotate/rechazo, sin auditoría estructurada ni prueba entre instancias; vínculo pendiente |

## 7. Consecuencias y riesgos residuales

La alternativa B mantiene el mapping y las credenciales bajo ms-users, permite verificadores con claves públicas y evita acoplar cada dominio a claims Google. El control de recursos permanece junto a sus datos, conservando los tres servicios de ADR-001.

El coste es operar un emisor, distribución de claves, entrega segura de enlaces y ciclo de sesiones propias, coordinar políticas en gateway y tres servicios y migrar Angular al contrato que se apruebe. Se necesitan pruebas de compatibilidad entre Java, Node, Python y APIM, y límites de disponibilidad/caché. La firma remota y el registro de cuenta pueden fallar; no se debe emitir una credencial ante validación incompleta.

Persisten robo/replay de bearer durante su vigencia, retraso de bajas de cuenta sin revocación compartida, compromiso del firmante, errores de autorización y ataques XSS. Una audiencia única aumenta reutilización entre servicios y exige reglas de recursos/capacidades correctas. Persisten compromiso/reasignación del buzón, abuso de entrega, escáneres y robo de renovación; los controles propuestos deben probarse. No se demuestra que Google o un buzón verificado representen matrícula/empleo activo ni que Azure impida acceso directo. Cualquier exposición y su severidad siguen condicionadas a evidencia del entorno real.

### 7.1. Límites físicos de repositorios y transición del scaffold

Separar repositorios no cambia responsabilidades de ADR-001: siguen siendo **tres microservicios**, con mensajería en `ms-catalog`. No se decide separar repositorios de `ms-catalog` ni `ms-notifications`. La referencia anterior a nombre/URL futuros queda corregida por evidencia: existe [a-calderon-org/ms-users-market-tec](https://github.com/a-calderon-org/ms-users-market-tec), con desarrollo independiente de dominio y persistencia.

| Repositorio | Responsabilidad y estado de autoridad |
|---|---|
| `a-calderon-org/market_tec` | Angular, arquitectura, ADR, contratos compartidos canónicos en `contracts/`, validación y compatibilidad. `app/ms-users` permanece como scaffold histórico; no desarrollar allí una segunda implementación de negocio. Su workflow actual no acredita despliegue del servicio independiente. |
| `a-calderon-org/ms-users-market-tec` | Ubicación del dominio/persistencia implementados y destino único propuesto para nuevos cambios de ms-users: identidad, perfiles, verificadores, emisión, sesiones, claves públicas y persistencia propios. Autenticación y cierre operativo siguen pendientes; autoridad operativa/pipelines requieren el corte documentado siguiente. |

**Verificado:** `app/ms-users` en esta base es un scaffold Java 21/Spring Boot de health/arquitectura sin dominio/persistencia. En el repositorio independiente, los objetos locales de `650411bdf0a5b9375fbe6911595f3150d79c633d` contienen [UserService](https://github.com/a-calderon-org/ms-users-market-tec/blob/650411bdf0a5b9375fbe6911595f3150d79c633d/src/main/java/com/markettec/users/application/usecases/UserService.java), [Email](https://github.com/a-calderon-org/ms-users-market-tec/blob/650411bdf0a5b9375fbe6911595f3150d79c633d/src/main/java/com/markettec/users/domain/model/Email.java), [principal de aplicación](https://github.com/a-calderon-org/ms-users-market-tec/blob/650411bdf0a5b9375fbe6911595f3150d79c633d/src/main/java/com/markettec/users/application/ports/in/AuthenticatedPrincipal.java), JDBC/transacciones y [Flyway V1](https://github.com/a-calderon-org/ms-users-market-tec/blob/650411bdf0a5b9375fbe6911595f3150d79c633d/src/main/resources/db/migration/V1__initial_users_schema.sql). V1 contempla GOOGLE/INSTITUTIONAL_EMAIL y unicidad efectiva de `(issuer,subject)` mediante hashes con comprobación de colisiones por adaptador; no hay unicidad de correo por persona. La composición deniega por defecto vinculación mediante `IdentityLinkAuthorization`; no acredita un flujo de vínculo seguro ya expuesto.

**Verificado en QA del 2026-11-01:** `git ls-remote` confirma `main@19ce9f18281c4d6a73985772824e60d4587bd80c` y `recovery/mtec37-appservice-readiness@7f963a98494a74acbe2479c91a372224ec55a033`. GitHub REST identifica en el [commit remoto](https://github.com/a-calderon-org/ms-users-market-tec/commit/19ce9f18281c4d6a73985772824e60d4587bd80c) los padres `650411b` y `7f963a9`; ambos árboles final/local son `6e58edc1251248d1548e5b65fb5e1396f91dd6d7`. La comparación desde `650411b` añade cuatro commits y modifica 31 archivos de preparación, observabilidad, SQL runtime, CI y documentación; desde `7f963a9` no cambia archivos. El [CI de ese HEAD](https://github.com/a-calderon-org/ms-users-market-tec/actions/runs/41364044664) figura completed/success; no se auditaron sus logs ni se repitieron sus pruebas. La limitación de la subfase 1 queda resuelta para contenido/merge, no para seguridad desplegada. Los recuentos de pruebas de [MTEC-34](https://allanaron06122005.atlassian.net/browse/MTEC-34?focusedCommentId=10138), [MTEC-35](https://allanaron06122005.atlassian.net/browse/MTEC-35?focusedCommentId=10139) y [MTEC-37](https://allanaron06122005.atlassian.net/browse/MTEC-37?focusedCommentId=10140) siguen **Documentados pero no verificados independientemente** en este QA. MTEC-37 permanece In Progress.

**Inferido del código y del historial verificados:** el repositorio independiente ya es la fuente de código de dominio/persistencia en la práctica; la transición documental y la autoridad operativa/de despliegue continúan pendientes del corte formal. El merge y su CI no acreditan autenticación Google/correo, sesiones, MI real, migración Azure o políticas APIM.

Procedimiento de corte propuesto, a revisar por RP y responsable ms-users antes de integrar MTEC-36:

1. Confirmar HEAD remoto revisable, historial de MTEC-34/35 y preparación MTEC-37, build/tests y checks del candidato. El destino ya existe: no copiar de nuevo el scaffold ni crear otro repositorio. Preservar todos los worktrees existentes.
2. Registrar responsable y punto de corte que declaren al repositorio independiente única implementación autoritativa de ms-users; dirigir allí cambios de negocio. El scaffold queda conservado sin divergencia funcional; su retirada o marca formal y redirección de README/CI se tramitan después en tarea autorizada. No se elimina `app/ms-users` aquí ni se desactiva su workflow en esta subfase.
3. Acordar con MTEC-15 una versión/commit de los contratos canónicos de `market_tec`, método de consumo y checks de compatibilidad. Resolver el principal local mínimo (`userId()`), VerifiedExternalIdentity, canonicalización de emisor y puertos de vínculo frente al perfil compartido futuro; no duplicar contratos ni suponer implementado GoogleTokenVerifier por aparecer en un ticket.
4. Acreditar que solo el artefacto del repositorio independiente puede desplegarse como ms-users, trazabilidad de versión, propietario y rollback; coordinar CI, mapa y documentación afectados según protocolo, en tarea posterior. No mantener dos pipelines que publiquen autoridades competidoras.

Los responsables, la fecha de corte y la autoridad de despliegue aún necesitan evidencia formal. Esto corrige ubicación/estado, no crea otra decisión arquitectónica ni reabre ADR-001. ADR-002 sigue Proposed y su propuesta de directorios se coordinará sin reescribirlo en MTEC-40.

## 8. Implementación por etapas y criterios de salida

Estas etapas describen trabajo futuro. Ninguna se ejecuta por publicar este ADR.

| Etapa | Trabajo recomendado | Dependencias y evidencia de salida |
|---|---|---|
| 1. MTEC-40: completar revisión técnica | Arquitectura base aceptada por RP en 2.1; revisar amenazas; designar seguridad; aprobar perfil mínimo de ambos métodos, sesiones y transición de repositorio, con acuerdos, responsables y plazos de decisiones diferidas. Revisar compatibilidad Angular sin modificarlo. | Aceptación del núcleo por RP ya registrada; revisión conjunta de componentes y perfil mínimo todavía pendientes. MTEC-15 debe registrar aprobación de las interfaces compartidas que se implementarán; no basta fusionar borradores. Aplicar los hitos siguientes sin convertir todo P01–P24 en un bloqueo inicial. |
| 2. MTEC-36: futura autenticación | En repositorio independiente, tras transición de 7.1 y dominio/mapping de MTEC-34: Google, correo, emisor, sesiones y JWKS/rotación aprobados. Coordinar ampliación del alcance con sus responsables, sin modificar Jira aquí. | Contratos revisados en MTEC-15; pruebas positivas/negativas de ambos métodos, enlaces, sesiones, claims, cuenta, concurrencia y claves; errores conforme al contrato aprobado; ausencia de secretos en logs. Desarrollo local no demuestra integración Azure. |
| 3. Seguridad defensiva | Adaptadores de autenticación en los tres servicios; principal confiable; autorización de ownership/participación/capacidad y rechazo de headers como autoridad. | Pruebas de token ausente/falsificado, principal válido, acceso propio/ajeno y efectos de cuenta/token revocado según P15. Sin consultas por request a ms-users ni bases compartidas. |
| 4. APIM e infraestructura | Preparar políticas efectivas por operación, metadata/JWKS, saneamiento de headers y conectividad/origen protegidos; aislar App Services conforme a P17. | Solo tras aprobación, verificación de capacidades reales y autorización de despliegue. Pruebas controladas de conectividad, credenciales rechazadas, ausencia de bypass y continuidad de rotación. Nunca aplicar ejemplos conceptuales como configuración aprobada. |
| 5. Verificación Azure | Cuando exista Azure MCP o acceso autorizado de solo lectura, inspeccionar políticas globales/producto/API/operación, herencia, backends, red, hosts/slots y origen/certificados; comprobar issuer/audience/discovery/JWKS y rotación. | Evidencia fechada y sanitizada del recurso, revisión de configuración efectiva y pruebas 401/403 autorizadas aparte; token legítimo aceptado, inválido rechazado y acceso directo bloqueado. Lectura autorizada no concede permiso de cambiar recursos ni ejecutar pruebas activas. |

### Acuerdos necesarios por hito

| Hito | Acuerdos imprescindibles | Detalles que no bloquean ese hito |
|---|---|---|
| Inicio de implementación interoperable de MTEC-36 | P01 resuelta; cerrar algoritmo y claims/identidad (P02–P12, P21), alta/dominios/vinculación y continuidad del titular (P16), enlaces/anti-replay (P18), renovación/revocación y transporte/CSRF de sesión (P10/P15/P23), propagación de principal (P19), estrategia conceptual de rotación (P13), frontera APIM/backend (P17) y clases de excepciones sin ciclo de autenticación (P22). Definir transición autoritativa de 7.1. Revisar en MTEC-15 la interfaz afectada; disponer del dominio/mapping de MTEC-34 para integrar el caso de uso. | Valores productivos de issuer/audience pueden cerrarse por entorno antes de integrarlo, usando configuración y fixtures de prueba identificados como tales. No requiere resolver SKU/permisos finales de Key Vault, intervalos operativos de rotación, topología Azure, cuotas ni migración completa del frontend. |
| Integración de autenticación y consumidores | Cerrar contratos de ambos accesos, desafío/enlace, renovación, logout y vinculación; principal/claims, issuer/audience/tiempos del entorno, metadata/JWKS (P12), ownership (P19/P20), cookies/CSRF/CORS (P23) y excepciones de autenticación/renovación/metadata (P22). | Automatización definitiva de rotación, umbrales finales de alertas y otros detalles operativos pueden avanzar en paralelo sin presentar la integración como producción segura. |
| Habilitación productiva | Evidencia de custodia, rotación normal/emergencia, revocación y ventana residual aceptada (P13–P15); protección de origen y acceso directo (P17); controles P20/P22–P24, configuración efectiva Azure y pruebas autorizadas de la matriz. | Ninguna incertidumbre sobre controles críticos puede omitirse: un aplazamiento requiere alcance y riesgo residual aceptados formalmente. |

El dominio de MTEC-34 y las pruebas aisladas de puertos/verificadores con fakes
no dependen de decidir la topología Azure. La estrategia aceptada no aprueba
decisiones criptográficas u operativas abiertas ni autoriza despliegues. No se
considera resuelto MTEC-12 sin evidencia de políticas y pruebas del entorno;
tampoco se cierra MTEC-15 solo por este ADR.

### Dependencias y exclusiones por ticket

| Ticket | Trabajo posterior coordinado; no ejecutado en MTEC-40 |
|---|---|
| MTEC-15 | Revisar/aprobar identidad y OpenAPI de ambos métodos, enlaces, sesiones, vinculación y errores, con compatibilidad de consumidores. Los borradores actuales no cubren el diseño completo. |
| [MTEC-34](https://allanaron06122005.atlassian.net/browse/MTEC-34) — Done | Dominio independiente existente. Revisar consumo real de principal y evidencia de identidad antes de conectar autenticación; no reabrir su alcance ni atribuirle verificador Google. |
| [MTEC-35](https://allanaron06122005.atlassian.net/browse/MTEC-35) — Done | JDBC/Flyway y validación reportada; no acredita migración Azure, identidad runtime/migrador ni aprobación de sesiones/esquema nuevo. |
| [MTEC-37](https://allanaron06122005.atlassian.net/browse/MTEC-37) — In Progress | Preparación CI, observabilidad y perfil de despliegue inspeccionados; completar evidencia de candidato/CI y cierre Azure/APIM después de sus dependencias, sin operar Azure aquí. |
| [MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36) — To Do | Bloqueado explícitamente por MTEC-40. Implementar solo tras aprobación y contratos revisados, coordinando correo/sesiones; esta subfase no lo inicia. |
| MTEC-12 | Inspección/validación futura de APIM, protección de origen, claves y despliegue Azure con autorización específica. Azure sigue no verificado. |
| MTEC-17 (Done) | Antecedente de endurecimiento del interceptor y expiración Google, ya completado. La futura migración Angular al JWT/sesión aprobados requiere planificación propia; no se reabre MTEC-17 ni se modifica frontend aquí. |

### Matriz mínima de validación futura

| Área | Positiva | Negativas y evidencia requeridas |
|---|---|---|
| Google/intercambio | Identidad elegible verificada → un único userId estable y credencial interna | Firma/algoritmo/issuer/audience/tiempo/dominio inválidos; nonce repetido; mapping concurrente; ninguna emisión o alta no autorizada |
| Correo institucional | Dominio aprobado y enlace confirmado recuperan/crean usuario interno | Dominios parciales/similares, enumeración, abuso de tasa, expiración, alteración, repetición, intento ajeno, escáner GET y consumo concurrente |
| Identidad/vinculación | Ambos métodos vinculados conservan el mismo userId | Sin prueba reciente de ambos métodos no hay vínculo; conflicto no fusiona ni duplica; correo reasignado no toma una cuenta automáticamente |
| Sesiones | Ambos métodos renuevan con sesión vigente dentro de 60 min/30 min/8 h y controles seguros por aprobar | Bordes de los tres límites, sondeos sin actividad, refresh sin reiniciar ocho horas; credencial anterior/revocada, replay/carreras, logout, CSRF, CORS/cookies y reautenticación sensible |
| Perfil interno | Token de emisor y clave aprobados aceptado en APIM y cada stack | Ausente, `none`, RS/HS, firma inválida, claims erróneos, clave ajena, tipos temporales y contexto Google/internal mezclados |
| Recursos | Acceso propio/participación permitidos | Lectura/escritura ajena bloqueada, actor del body ignorado, ausencia de efecto en datos y principal no suplantado por headers |
| Claves y operación | Clave nueva y anterior válidas durante solapamiento calculado | Clave comprometida rechazada en todos los validadores, cachés precargadas, caída JWKS, no material privado ni tokens en logs |
| Azure | Ruta legítima por gateway con origen backend validado | Acceso directo/alternativo bloqueado, políticas efectivas en todas las rutas, login/JWKS sin dependencia circular y rechazo observable 401/403 |

### 8.1. Matriz de cambios contractuales requeridos — coordinación MTEC-15

**Verificado en esta consolidación:** el baseline de `origin/main@c5dc74f`
es `0.2.0-draft`; ya incluye intentos, Google/enlace, refresh/logout, actividad,
pruebas de método, perfil propio y JWKS/metadata. La ausencia de esas rutas en
0.1 era evidencia histórica, no estado actual. La candidata es **0.3.0-draft**.

Las interfaces y condiciones vigentes son canónicas en el [contrato de identidad](../../contracts/identity/IDENTITY_CONTRACT.md)
y [Users OpenAPI](../../contracts/openapi/users.json). Las diferencias frente a
0.2, compatibilidad, superficies habilitables y bloqueadas, evidencia QA y
conformidades B07 se revisan en [release review MTEC-15](../../docs/MTEC15_AUTH_CONTRACT_RELEASE_REVIEW.md).
Publicar el Draft no aprueba interfaces ni demuestra consumo por Angular/APIM.
No se añaden endpoints de passkeys/recuperación ni se convierte B04/D4/D5 en
especificación definitiva.

## 9. Documentación afectada y actualizaciones posteriores

La consolidación MTEC-15 del 2026-11-02 actualiza este ADR y
[DECISION_LOG](DECISION_LOG.md), los contratos Draft de identidad/Users y su QA,
con [release review B07](../../docs/MTEC15_AUTH_CONTRACT_RELEASE_REVIEW.md).
Los informes previos MTEC-40/MTEC-15 conservan evidencia histórica; no se
reescriben como si hubieran validado esta candidata. No cambian hechos de
implementación ni configuración desplegada. Conforme al protocolo, las
arquitecturas de aplicaciones, integración, auditorías históricas y deuda
conservan sus descripciones del código real. Los desfases históricos E6/E7
continúan señalados, sin ampliar el alcance a implementación/Azure. La fuente
canónica de transición de repositorio permanece en 7.1.

Con el núcleo aceptado, la alineación posterior de prosa requiere trabajo
autorizado de sus dueños; cambios de interfaz esperan MTEC-15 y hechos
operativos esperan evidencia. Se aplicará el [protocolo de
actualización](../maintenance/UPDATE_PROTOCOL.md), coordinando con los
responsables de los documentos:

| Documento dueño | Actualización posterior necesaria |
|---|---|
| [Contrato de identidad](../../contracts/identity/IDENTITY_CONTRACT.md) y [Users OpenAPI](../../contracts/openapi/users.json) | Registrar perfil/claims, ambos métodos, alta/dominios/vinculación, enlaces/anti-replay, renovación/logout y excepciones aprobados; versionar incompatibilidades. No actualizar antes de revisión conjunta de MTEC-15. |
| [Infraestructura Azure](../phase2/AZURE_INFRASTRUCTURE.md) | Alinear custodia asimétrica, distribución de claves, políticas y protección del origen con capacidades verificadas; distinguir propuesta de despliegue. |
| [APIs y eventos](../phase2/API_AND_EVENTS.md), [arquitectura de servicios](../phase2/MICROSERVICES_ARCHITECTURE.md) y [trazabilidad](../phase2/REQUIREMENTS_TRACEABILITY.md) | Retirar ejemplo HS256 y ambigüedad Google/interno; alinear ejemplos con contrato aprobado y límites Accepted de ADR-001. |
| [Roadmap](../phase2/IMPLEMENTATION_ROADMAP.md) y [backlog](../phase2/JIRA_BACKLOG.md) | Coordinar etapas, dependencias, ampliación de autenticación y transición de repositorio con tickets vigentes sin tratar identificadores históricos propuestos como tickets reales. |
| [GOOGLE_LOGIN](../../app/GOOGLE_LOGIN.md), [estado frontend](../frontend/STATE_MANAGEMENT.md) e [integración](../integration/FRONTEND_BACKEND.md) | Describir el intercambio y almacenamiento cuando se implementen; separar presentación de autenticación y dominio Google de identidad interna. |
| [Mapa del repositorio](../REPOSITORY_MAP.md), [fundación implementada](../phase2/IMPLEMENTED_FOUNDATION.md), README y workflows de ms-users | Actualizar ubicación autoritativa, consumo de contratos, ejecución y CI cuando se apruebe/ejecute la transición de 7.1. Conservar la descripción de la fundación actual hasta entonces. |
| [Deuda técnica](../audits/TECHNICAL_DEBT.md) y evidencia de auditoría | Registrar controles comprobados, limitaciones y riesgo residual cuando existan pruebas, conservando auditorías históricas. |

## 10. Registro de aceptación delimitada y revisión humana pendiente

La tabla siguiente conserva el registro histórico del 2026-11-01. Las aprobaciones
posteriores del 2026-11-02 y la política C del 2026-11-04 prevalecen; en particular
ya no son vigentes como pendientes el algoritmo/RSA-2048, TTL nominal máximo
240 s, residual ordinario requerido y políticas B02/B03/B06 allí delimitadas.
Los detalles operativos y las conformidades permanecen abiertos.

**Acta del núcleo:** el responsable del proyecto aprobó expresamente la
arquitectura base el **2026-11-01**, con alcance exacto en 2.1 y motivos en 2.
No se registran firmas, identidades de revisores ni conformidades ajenas a esa
autoridad. Los bloques de parámetros pendientes conservan alternativas, riesgos,
propietarios por rol e hitos en 4; amenazas en 6/7 y contratos en 8.1.

| Bloque | Aceptación registrada | Decisiones y evidencia aún requeridas | Roles para revisar los pendientes | Estado |
|---|---|---|---|---|
| Estrategia e identidad P01/P05/P16/P21 | RP, 2026-11-01: B ampliada, ambos métodos en primera versión, userId común, allowlist exacta y posesión verificada para básico; vínculo exige prueba, sin fusión por correo ni privilegios/clasificación por dominio | Perfil Google, alta/continuidad/recuperación y pruebas de control de métodos; no introducir requisito de matrícula/empleo | Funcional; ms-users; consumidores; frontend; SEG; RP para resolver pendientes | Núcleo Accepted; controles Proposed; conformidades técnicas pendientes |
| JWT y claves P02–P09/P11–P14 | RP, 2026-11-01: ms-users emite; verificadores comparten emisor/claves públicas, nunca privadas | Algoritmo/tamaño/typ, claims, iss/aud, JWKS/cachés, custodio, rotación normal/emergencia y operador; no inferir aprobación RS256 | ms-users; APIM/infra; tres servicios; SEG; RP | Perfil Proposed; sin conformidades técnicas ni fecha de cierre |
| Sesiones/enlaces P10/P15/P18/P23 | RP, 2026-11-01: ventana renovable 60 min, inactividad 30 min y máximo absoluto ocho horas desde login inicial sin reinicio; primer límite vence en servidor, aviso previo y renovación solo válida; sondeos no cuentan; expirada exige autenticación nueva | JWT 15 min candidato; aviso 5 min propuesto; cómputo de actividad, rotación/compromiso, reauth sensible, pestañas/carreras, cookies/CSRF/CORS/ámbitos, TTL/tasas/enlaces y residual | Funcional; ms-users; frontend; APIM; SEG; RP | Política funcional Accepted; mecanismos Proposed; residual no aceptado |
| Autorización/fronteras P17/P19/P20/P22/P24 | RP, 2026-11-01: APIM admite y aplica políticas; servicios revalidan y autorizan; identidad de servicio/eventos/delegación explícita según 5 | Protección directa/origen, principal/capacidades, protocolos internos, rutas/excepciones exactas, cuotas/logs y evidencia Azure | Tres servicios; frontend; APIM/infra; SEG; RP | Reparto y comunicación Accepted; controles Proposed; Azure no verificado |
| Contratos/transición 7.1/8.1 | Ninguna aprobación contractual ni corte operativo nuevos | Versión/consumo canónicos, compatibilidad, responsable/fecha de corte, único artefacto y tratamiento del scaffold/workflow | ms-users; tres responsables de contratos; frontend; APIM/infra; RP | Proposed; MTEC-15 sin aprobación conjunta |

### Condiciones de salida y pendientes por asignar

1. Designar revisión de seguridad y mapear cada rol a persona con autoridad;
   registrar referencia, conformidad o desacuerdo y condiciones. La aprobación
   del RP no sustituye estas revisiones.
2. Resolver los acuerdos técnicos iniciales aún pendientes según §3.4.1 y
   4, con valores/semántica, entornos y aceptación residual explícitos. Mantener
   los alcances ya Accepted y sus pruebas; ninguna recomendación o fixture
   aprueba parámetros. Issuer/audience/client IDs y URLs reales pueden cerrarse
   antes de integrar su entorno, pero el perfil interoperable debe acordarse
   antes de I.
3. Revisar/aprobar con MTEC-15 cada interfaz de 8.1 antes de implementarla y
   aplicar el alcance de ambos métodos y sesiones ya registrado en MTEC-36.
   No modificar Jira ni comenzar MTEC-36 automáticamente; MTEC-40 sigue
   In Progress y sus criterios no están completos.
4. Asignar persona y fecha/hito comprometido para pendientes de 4, incluido
   cómputo de actividad y cumplimiento de límites, acceso JWT, UX,
   rotación/revocación,
   continuidad, cookies y carreras. Los propietarios son roles y los plazos
   propuestos, no compromisos humanos inventados. Custodio/presupuesto, SLA,
   acceso directo y evidencia APIM/MI requieren cierre antes de D.
5. Registrar conformidades/desacuerdos técnicos y de seguridad, acuerdos
   mínimos, contratos y revisión formal exigida por MTEC-40. Su PR revisado
   corresponde a fase posterior autorizada; no se crea aquí.

**Aprobación acreditada:** arquitectura base RP del 2026-11-01 y ampliaciones
delimitadas RP del 2026-11-02 en §3.4.1. Las conformidades técnicas y de seguridad,
el perfil exacto, demostración de residual ordinario y respuesta crítica siguen pendientes. Sus pruebas no se presentan
como ejecutadas. ADR-004 queda **Accepted con alcance delimitado**; MTEC-40 no
se cierra, MTEC-36 no queda listo para implementación completa y Azure/APIM
siguen no verificados.
