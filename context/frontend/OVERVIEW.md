# Frontend: visión general

SPA Angular 22 standalone, responsive y en español. Todas las rutas funcionales están protegidas por un guard basado en un ID token de Google guardado en `sessionStorage`.

## Funcionalidad por feature

- `auth`: botón Google funcional en cliente y formulario institucional de maqueta.
- `home`: obtiene una página de publicaciones, pagina y filtra localmente esa página.
- `publications`: detalle, formulario de alta y vista de publicaciones del usuario.
- `profile`: panel de consulta/edición.
- `messenger`: lista chats, selecciona conversación y envía mensajes; los enviados se agregan solo a estado de sesión.
- `shared`: tarjeta reutilizable y envoltorio paginado.

El API real no vive en este repositorio: la URL se inyecta en `environment.apiBaseUrl`.

