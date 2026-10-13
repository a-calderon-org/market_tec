# Backend: visión general

El backend local es un servicio Express mínimo ubicado en `app/backend`; no es la API funcional consumida por el frontend. El README lo declara reservado para una fase posterior y describe APIM Mock Services como backend de Fase I.

## Responsabilidad verificada

- Cargar variables mediante `dotenv/config`.
- escuchar en `process.env.PORT || 3000`.
- aceptar JSON y CORS.
- responder `200 { "status": "ok" }` en `GET /api/health`.

No se encontraron rutas de publicaciones, usuarios, chats o autenticación. Tampoco modelos, persistencia, procesos asíncronos, servicios externos, logging estructurado ni middleware de errores.

## Ejecución

`npm run build` compiló correctamente el 2026-10-13. `tsx` resolvió el specifier `src/server.js` hacia la fuente TypeScript al probarlo con su loader; el watch completo no se validó porque el sandbox bloqueó su socket IPC. El backend no forma parte del workflow de despliegue observado.

