# Backend: dependencias

## ms-catalog (servicio independiente)

**Verificado:** `app/ms-catalog` usa Ajv 8.20.0 y ajv-formats 3.0.1 como
dependencias de desarrollo fijadas en package-lock para validar respuestas HTTP
contra JSON Schema Draft 2020-12. La persistencia del catálogo usa los SDK
productivos `@azure/cosmos` y `@azure/identity`, fijados en el lockfile. La
[configuración de Cosmos](../../app/ms-catalog/README.md#persistencia-cosmos--mtec-29)
describe credenciales y permisos.
Las secciones siguientes describen exclusivamente el auxiliar `app/backend`.

## Producción

- `express` 5: servidor HTTP.
- `cors`: middleware CORS, actualmente sin restricciones.
- `dotenv`: carga de `.env` en el proceso de arranque.

## Desarrollo

TypeScript estricto, `tsx` y tipos de Node/Express/CORS. `npm run build` invoca `tsc`. No existen herramientas declaradas de testing o linting.

`API_BASE_URL` y `API_SUBSCRIPTION_KEY` aparecen en `.env.example`, pero no son leídas por el código. No se documentan valores reales.

