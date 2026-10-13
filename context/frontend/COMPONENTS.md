# Frontend: componentes y rutas

| Ruta/componente | Responsabilidad | Servicios |
|---|---|---|
| `/` → `Home` | catálogo, paginación, búsqueda/filtros/orden local | `PublicationService`, `HomeFilterService` |
| `/login` → `Login` | Google GIS y maqueta de credenciales TEC | `GoogleAuthService`, `LoginService` |
| `/mis-publicaciones` → `MyPublications` | estadísticas y filtros de publicaciones de `USR-001`; recibe metadatos paginados, pero sus controles no navegan | `PublicationService` |
| `/publicaciones/nueva` → `PublicationCreate` | formulario, previews locales y POST | `PublicationService`, `PublicationFeedbackService` |
| `/publicaciones/:id` → `PublicationDetail` | detalle, galería y enlace a mensajería | `PublicationService` |
| `/mensajes` → `Messenger` | lista, filtro, selección y envío; descarta metadatos paginados de la lista | `ChatService` |

`App` es el shell: header, navegación, tema, logout, perfil y toast de creación. `Profile` se renderiza como panel desde el shell. `PublicationCard` se reutiliza en el catálogo.

Las plantillas incluyen numerosos labels y atributos ARIA. Sin embargo, el panel de perfil no implementa semántica/foco completo de diálogo y no hay pruebas automatizadas de accesibilidad.

