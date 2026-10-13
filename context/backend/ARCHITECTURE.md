# Backend: arquitectura

## Estructura real

```text
src/server.ts -> importa src/app.ts -> Express middleware -> GET /api/health
```

- `server.ts`: composición operativa y apertura del puerto.
- `app.ts`: creación de la aplicación, middleware global y ruta.

La separación entre aplicación y listener permite probar `app` sin abrir puerto, aunque no existen pruebas. No hay capas de controlador, servicio, dominio o repositorio porque no se implementa lógica de negocio.

## Comportamiento transversal

- CORS: `cors()` sin allowlist.
- Parsing: `express.json()` con límites predeterminados de Express.
- Errores: comportamiento predeterminado; no hay formato contractual.
- Logging: solo mensaje de arranque mediante `console.log`.
- Apagado: no hay manejo explícito de señales.

No debe describirse este servidor como origen de la API del marketplace hasta que exista evidencia de integración.

