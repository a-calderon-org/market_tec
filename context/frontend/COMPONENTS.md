# Frontend: componentes y rutas

| Ruta/componente | Responsabilidad | Servicios |
|---|---|---|
| `/` → `Home` | catálogo completo por lotes, búsqueda/filtros/orden previos a paginación local e historial de búsquedas | `PublicationService`, `HomeFilterService`, `RecentSearchService` |
| `/login` → `Login` | Google GIS y maqueta de credenciales TEC | `GoogleAuthService`, `LoginService` |
| `/mis-publicaciones` → `MyPublications` | estadísticas y filtros de publicaciones de `USR-001`; recibe metadatos paginados, pero sus controles no navegan | `PublicationService` |
| `/publicaciones/nueva` → `PublicationCreate` | formulario, previews locales y POST | `PublicationService`, `PublicationFeedbackService` |
| `/publicaciones/:id` → `PublicationDetail` | detalle, galería y enlace a mensajería | `PublicationService` |
| `/mensajes` → `Messenger` | lista, filtro, selección y envío; descarta metadatos paginados de la lista | `ChatService` |

`App` es el shell: header, navegación, tema, logout, perfil y toast de creación. `Profile` se renderiza como panel desde el shell. `PublicationCard` se reutiliza en el catálogo.

**Verificado:** la búsqueda de Home se aplica mientras se escribe; enviar el formulario registra la consulta normalizada. El desplegable permite reutilizar, eliminar o limpiar búsquedas recientes con botones nativos de teclado. Conserva interacciones internas aunque `focusout.relatedTarget` sea nulo, cierra ante puntero exterior o Escape y restaura el foco al campo cuando corresponde.

**Verificado:** las opciones de categoría de Home se derivan de los valores `categoria` presentes en el catálogo cargado. El valor exacto recibido se conserva como clave del filtro; solo la etiqueta visible aplica nombres amigables a los tres códigos conocidos (`electronicos`, `alquiler`, `tutoria`) y formato legible a cualquier otro valor.

Las plantillas incluyen numerosos labels y atributos ARIA. Sin embargo, el panel de perfil no implementa semántica/foco completo de diálogo y no hay pruebas automatizadas de accesibilidad.

