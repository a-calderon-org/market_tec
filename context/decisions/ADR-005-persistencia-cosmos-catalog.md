# ADR-005 — Persistencia Cosmos de ms-catalog

**Fecha:** 2026-11-09

**Estado:** Proposed — pendiente de aprobación del responsable del proyecto

**Destinatarios:** mantenedores de ms-catalog y responsables de infraestructura

**Ticket:** [MTEC-29](https://allanaron06122005.atlassian.net/browse/MTEC-29)

## Contexto y evidencia

**Verificado:** MTEC-29 pide repositorios Cosmos propios, consultas filtradas,
concurrencia, manejo de fallos y pruebas contra emulador o entorno indicado.
MTEC-28 está Done. MTEC-20 y MTEC-32 pasaron a In Progress y registraron
el traspaso de autenticación desde ms-users. MTEC-30/31/33 siguen To Do. El código local
contiene publicaciones y una extensión de mensajería sin confirmar. La autorización
del epic MTEC-20 permite desarrollo independiente con fakes; mantiene pendientes
las decisiones definitivas de persistencia. ADR-001 tampoco las aprueba.

Puertos y comportamientos que debe conservar el adaptador:

| Puerto | Garantía observada |
|---|---|
| `PublicationRepository` | ID global único; inserción sin sobrescritura; reemplazo condicionado por revisión y propietario; fecha con precisión de milisegundos |
| `ChatRepository` | Un chat por `(publicationId,buyerId)`; ID global único; retry devuelve el chat existente; listado de ambos participantes |
| `MessageRepository` | IDs de mensaje y evento únicos en sus respectivos conjuntos; preparar ambos o ninguno; listado por chat |
| Listados | Filtros antes de contar/paginar; total sin limitar; orden temporal/precio y desempate por ID ascendente |

Fuentes: [publicaciones](../../app/ms-catalog/src/application/ports/out/publication-repository.ts),
[chats](../../app/ms-catalog/src/application/ports/out/chat-repository.ts),
[mensajes](../../app/ms-catalog/src/application/ports/out/message-repository.ts),
[fake de publicaciones](../../app/ms-catalog/src/adapters/out/in-memory-publication-repository.ts)
y [fakes de mensajería](../../app/ms-catalog/src/adapters/out/in-memory-messaging-repository.ts).
Los archivos de mensajería son una dependencia local pendiente de revisión, no una
entrega remota acreditada.

**Verificado localmente:** Node 24.21.0; `npm run check` en `app/ms-catalog`
completa tipos, compilación y 89/89 pruebas. La primera ejecución encontró
`EACCES` en conexiones HTTP loopback dentro del sandbox; fuera de él pasó completa.
Docker CLI 29.7.2 está instalado, pero su motor no responde. Estas pruebas usan
memoria, no acreditan persistencia Cosmos ni autenticación JWT.

**Documentado pero no verificado:** la propuesta de infraestructura usa API NoSQL,
pero `MICROSERVICES_ARCHITECTURE.md` también menciona API MongoDB como mitigación.
No son equivalentes; este ADR propone resolver la discrepancia con NoSQL.

**No determinado:** cuenta/región, modo de capacidad, volumen, crecimiento,
presupuesto RU, SLO, retención, credenciales de prueba y emulador compatible con
Node 24. No se inspeccionaron secretos ni recursos Azure.

## Alternativas

| Alternativa | Ventajas | Costes y límites |
|---|---|---|
| A. Una partición lógica por contenedor, alcance acotado | Conserva puertos e invariantes actuales con transacciones locales, sin duplicar datos de consulta | Cuello de botella por contenedor; no escala horizontalmente dentro de él; necesita medición y migración para crecer |
| B. Publicaciones por ID/vendedor, chats por publicación, mensajes por chat | Distribuye carga y acota historial por chat | Unicidad global de IDs y búsqueda de chat solo por ID requieren rediseño; índices por participante pueden necesitar proyecciones; no hay transacción entre particiones |
| C. Registro global de IDs y proyecciones por usuario sobre B | Mantiene localización y mejora lecturas por participante | Reservas y escrituras distribuidas, recuperación de fallos parciales y proyecciones eventualmente consistentes; mayor alcance que los puertos actuales |

**Inferido:** A permite verificar primero un adaptador correcto para los contratos
locales existentes. B es preferible para crecimiento, pero implementarla sin revisar
unicidad, localización y atomicidad cambiaría silenciosamente el comportamiento.
No se recomienda C sin carga real que justifique esa complejidad.

## Diseño propuesto para aprobación

Se propone **A exclusivamente como primer incremento local/de prueba**, API
**Cosmos DB for NoSQL**, SDK oficial `@azure/cosmos` fijado en lockfile una vez
comprobada compatibilidad. No es una recomendación de capacidad productiva.
La aprobación de este alcance permite implementar y probar el adaptador; no
autoriza aprovisionar Azure, desplegar ni aceptar límites productivos desconocidos.

### Contenedores y claves

Base exclusiva de ms-catalog; nombres configurables; todos con ruta `/pk`:

| Nombre lógico | `pk` constante propuesta | Tipos de documento |
|---|---|---|
| `publicaciones` | `publications-v1` | Publicación |
| `chats` | `chats-v1` | Chat y reserva de pareja |
| `mensajes` | `messages-v1` | Mensaje y evento interno pendiente |

La constante es deliberada para conservar unicidad global y atomicidad de los
fakes. Todas las lecturas deben especificarla. No usar una partición por usuario:
un chat pertenece a dos usuarios y el evento debe prepararse con su mensaje.

Separar documentos de persistencia del dominio: `schemaVersion`, `kind`, `pk`,
ID físico e ID lógico explícitos. Para IDs opacos usar codificación inyectiva de
unidades UTF-16 (base64url de UTF-16LE), con prefijo de tipo. Probar separadores,
Unicode y surrogates aislados admitidos actualmente por los validadores; no
restringirlos silenciosamente por limitaciones del ID físico de Cosmos.
El mapeo debe validar tamaño y rechazar documentos corruptos sin devolver datos
parciales. `_etag`, `pk` y campos auxiliares no llegan a DTO ni dominio.

Publicaciones conservan `createdAtMs` entero y restauran `Date`; no truncar a
segundos al persistir. Mensajería conserva Epoch seconds. Guardar `sortId` como
hexadecimal de cuatro dígitos por unidad UTF-16 del ID lógico para reproducir el
desempate de JavaScript sin depender de la colación del ID físico codificado.
Guardar `searchText = (titulo + '\n' + descripcion).toLocaleLowerCase('es')`;
normalizar `q` igual que el fake. No aplicar `LOWER` sobre documentos en consulta.

### Escrituras y concurrencia

* Publicaciones: `create`, nunca `upsert`. Para `replace`, leer documento y ETag;
  verificar revisión esperada, propietario y nueva revisión; reemplazar con
  `If-Match`. Un cambio entre lectura y escritura debe fallar, nunca sobrescribir.
* Chats: reserva de pareja con ID determinista `pair:` + SHA-256 de la tupla JSON
  `[publicationId,buyerId]`. Almacenar también la tupla completa y el ID del chat.
  Crear reserva y chat en un solo transactional batch. Si la pareja ya existe,
  verificar igualdad de tupla y devolver el chat almacenado. Una colisión de hash
  debe fallar sin alias ni sobrescritura. Si colisiona solo el ID del chat con otra
  pareja, rollback completo y `CHAT_CONFLICT`. Leer la causa real de un batch;
  los errores 424 de operaciones dependientes no son el origen del conflicto.
* Mensajes: validar correspondencia mensaje/evento antes del batch; crear ambos
  con prefijos distintos. Duplicado de cualquiera revierte ambos. El evento
  interno no expira ni se elimina antes de confirmar su publicación bajo el
  protocolo que acuerde MTEC-31. No enviar a Queue dentro de la transacción.
* No ampliar aquí publicación, borrado, moderación, participantes o ownership.
  La autorización permanece en los casos de uso con principal confiable; los
  tests de adaptadores solos no prueban autenticación real.

Un timeout después del envío puede tener resultado de commit desconocido. No
informar éxito ni repetir la operación con IDs nuevos automáticamente. Reconciliar
por los IDs originales; si mensaje y evento coinciden, reconocer el estado
persistido sin duplicarlos. El puerto actual no define idempotencia de `send`
entre peticiones HTTP: esa política requiere coordinación MTEC-30/31/32.

### Consultas, índices y metadata

Construir SQL parametrizado. Solo nombres de orden permitidos mediante lista
cerrada. Reutilizar exactamente el mismo predicado para datos y `COUNT(1)`:

| Consulta | Predicado e índice de rango candidato | Compuesto candidato |
|---|---|---|
| Catálogo | `kind`, categoría exacta, precio inclusivo, `CONTAINS(searchText,@q)` si q no vacío | `(createdAtMs dir, sortId asc)` y `(precio dir, sortId asc)` |
| Propietario | Añadir igualdad de `ownerId` en servidor, antes de contar | Probar prefijos `ownerId`, `categoria` según combinaciones medidas |
| Chats de participante | `kind='chat' AND (buyerId=@u OR sellerId=@u)` | `(createdAt desc, sortId asc)` |
| Mensajes de chat | `kind='message' AND chatId=@chat` | `(chatId asc, sentAt asc, sortId asc)` |

Incluir índices de rango para campos filtrados/ordenados, `sortId`, `searchText`
y `/pk`; excluir texto de mensaje, snapshots, imágenes y payload de evento cuando
no se consulten. Materializar índices de ambos sentidos para precio/fecha: invertir
todo el compuesto no sirve si `sortId` permanece ascendente. Las políticas JSON
finales se validarán contra consultas reales y métricas; esta tabla es candidata,
no evidencia de utilización. No habilitar scans de documentos como fallback ante
índices ausentes. Las consultas por usuario/chat no deben cargar toda la colección
para filtrar en Node.

Conservar `page/pageSize`: `OFFSET (page-1)*pageSize LIMIT pageSize` y un conteo
separado, agregando todas las páginas del SDK necesarias. `MaxItemCount` es un
límite de transporte, no la página de negocio. No terminar por una página vacía
si el iterador aún tiene continuación. El coste aumenta con el offset; el conteo
tampoco es gratis. `CONTAINS` puede recorrer el índice: no prometer búsqueda
substring de coste constante ni equivalencia con búsqueda full-text.

**Semántica propuesta:** total exacto de la consulta de conteo, sin aproximaciones,
con los mismos filtros; datos y total no forman una instantánea conjunta bajo
escrituras concurrentes. Session consistency y orden determinista no garantizan
esa instantánea ni evitan desplazamientos entre páginas. Si aceptación exige una
instantánea común, revisar el diseño antes de implementar; dos consultas no bastan.
No añadir cursores públicos ni cambiar OpenAPI en este incremento. Tokens del SDK
permanecen internos; una futura API de cursor exige contrato, binding a filtros y
principal, y tratamiento de expiración/versionado.

### Consistencia, configuración y fallos

Proponer **Session** en entorno de prueba y un `CosmosClient` reutilizado por
proceso. La caché de sesión del cliente no garantiza read-your-writes al cambiar
de instancia; no prometer consistencia global o instantáneas de varias consultas.
La cuenta debe soportar el nivel seleccionado; no se eleva desde un cliente una
cuenta con garantías inferiores. Verificar comportamiento entre dos clientes.

La composición de infraestructura se activa con `CATALOG_PUBLICATIONS_STORE=cosmos`.
El proceso valida el acceso y la definición de partición de los contenedores
antes de aceptar tráfico. El [README del servicio](../../app/ms-catalog/README.md#persistencia-cosmos--mtec-29)
describe la configuración por entorno, el soporte de Managed Identity y el uso
de credenciales externas en emulador. El aprovisionamiento, la asignación de
permisos y la red del entorno productivo quedan con MTEC-33.

404 de lectura puntual de recurso devuelve ausencia; 404 de contenedor/configuración
es fallo de infraestructura. 409 de inserción y 412 de reemplazo se traducen al
conflicto correspondiente. 429 respeta espera/reintentos acotados del SDK, con
presupuesto total y sin otra capa infinita de retries. 401/403 de Cosmos no se
presentan como denegación de ownership del usuario. Agotamiento, timeout y 5xx
propagan fallo saneado; nunca lista vacía o éxito ficticio. Registrar operación,
duración, status, RU y actividad del proveedor, sin SQL parametrizado, texto,
perfiles, claves, tokens ni diagnósticos crudos potencialmente sensibles.

## Validación requerida tras aprobación

1. Suite de contrato reutilizable contra fake y adaptador: roundtrip, copias,
   inexistencia, duplicados, fechas, ownership, filtros combinados, Unicode,
   metadatos, orden y páginas vacías. Cubrir ambos participantes y separación de chats.
2. Dos clientes independientes contra Cosmos: carrera de revisión (un ganador),
   creación de la misma pareja (un chat), colisión de ID en otra pareja,
   rollback de mensaje/evento y fallo de cada operación del batch. Repetir tras
   recrear cliente para demostrar persistencia.
3. Fallos inyectados: 404 recurso/contenedor, 409/412, 424 subordinado, 429 con
   agotamiento, 401/403, 5xx, timeout antes/después de commit y documento inválido.
   Los dobles no sustituyen pruebas reales de transacciones y SQL.
4. Emulador compatible con SDK Node 24 o cuenta de prueba explícitamente indicada,
   contenedores aislados por ejecución y limpieza solo de recursos creados por esa
   ejecución. TLS verificado; no desactivar globalmente validación de certificados.
   En CI, integración explícita que falle si no hay entorno; no ocultarla como skip
   dentro de una ejecución presentada como validación Cosmos completa.
5. Benchmark reproducible con cardinalidad, tamaño y distribución registrados:
   catálogo global, propietario, dos participantes, chat, substring raro/común,
   rango de precio, todos los órdenes y offsets crecientes. Recoger RU total
   (datos + conteo), latencia p50/p95, reintentos, índice utilizado y documentos
   cargados. Establecer presupuesto/SLO con el responsable usando esos resultados.
6. Ejecutar `npm run check`, integración Cosmos y contratos existentes; publicar
   evidencia técnica verificable en los documentos dueños, sin transcripciones.

## Riesgos y condiciones de producción

La partición constante limita cada contenedor a una partición lógica: no hay
escalado horizontal de sus datos. [Microsoft documenta actualmente 20 GB por
partición lógica](https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning).
No aprobar producción sin revisar almacenamiento proyectado, margen de crecimiento,
retención de mensajes/eventos y carga máxima. No usar TTL para solucionar capacidad
si elimina historial o eventos todavía pendientes. El coste de offset, conteo y
substring puede ser inaceptable antes de alcanzar el límite de almacenamiento.

Para superar ese alcance se necesita otro diseño aprobado: B con revisión explícita
de unicidad y localización, o C con reconciliación y proyecciones. Cambiar claves
implica migración; no es un ajuste transparente. La preparación atómica del evento
no implementa entrega, retry, deduplicación de consumidor ni outbox dispatcher:
todo ello sigue en MTEC-31 y el contrato externo permanece sin modificar.

## Resultado del incremento local — 2026-11-10

**Verificado:** alternativa A implementada con SDK `@azure/cosmos@4.10.2`,
composición explícita y pruebas contra el emulador NoSQL vNext por HTTPS. El
listado omite la cota superior cuando el dominio usa `Number.MAX_VALUE` para
representar un precio sin límite. Este valor causó un desbordamiento al
enviarse al emulador como parámetro. Los máximos explícitos siguen siendo
inclusivos. La [guía de validación](../../app/ms-catalog/README.md#persistencia-cosmos--mtec-29)
registra los comandos y el alcance comprobado.

**No determinado:** capacidad, utilización real de los índices y RU en Azure.
La aprobación productiva de particiones, consistencia y paginación sigue
pendiente. [MTEC-32](https://allanaron06122005.atlassian.net/browse/MTEC-32)
integra el principal JWT y el snapshot de vendedor para staging. La prueba Cosmos
reutiliza ese verificador con JWT firmados localmente y un perfil de prueba.
Queda pendiente probar el flujo con ms-users y Cosmos en el entorno de staging.

## Referencias técnicas primarias

* [Transacciones y ETag](https://learn.microsoft.com/en-us/azure/cosmos-db/database-transactions-optimistic-concurrency): condicionamiento de escritura dentro de la partición.
* [Transactional batch](https://learn.microsoft.com/en-us/azure/cosmos-db/transactional-batch): alcance atómico y rollback.
* [Claves únicas](https://learn.microsoft.com/en-us/azure/cosmos-db/unique-keys): unicidad limitada a la partición.
* [Índices](https://learn.microsoft.com/en-us/azure/cosmos-db/index-overview) y [políticas](https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-indexing-policy): costes y candidatos, sin benchmark local todavía.
* [Paginación](https://learn.microsoft.com/en-us/cosmos-db/query/pagination) y [OFFSET LIMIT](https://learn.microsoft.com/en-us/cosmos-db/query/offset-limit): páginas de transporte y páginas de aplicación.
* [Consistencia](https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-consistency): nivel de cuenta y sesiones del cliente.
