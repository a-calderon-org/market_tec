# Backend: dependencias

## Producción

- `express` 5: servidor HTTP.
- `cors`: middleware CORS, actualmente sin restricciones.
- `dotenv`: carga de `.env` en el proceso de arranque.

## Desarrollo

TypeScript estricto, `tsx` y tipos de Node/Express/CORS. `npm run build` invoca `tsc`. No existen herramientas declaradas de testing o linting.

`API_BASE_URL` y `API_SUBSCRIPTION_KEY` aparecen en `.env.example`, pero no son leídas por el código. No se documentan valores reales.

