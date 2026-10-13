# Visión del proyecto

Revisión: 2026-10-13, commit `30ff761`.

## Propósito y alcance

**Verificado:** MarketTec es una SPA para un marketplace de la comunidad del TEC Campus San Carlos. Implementa catálogo paginado, búsqueda y filtros locales, detalle y creación de publicaciones, publicaciones propias, perfil, mensajería y acceso con Google. La evidencia está en las rutas de `app/frontend/src/app/app.routes.ts` y los módulos bajo `features/`.

**Verificado:** la aplicación funcional es principalmente el frontend Angular. Este llama a una URL configurada de Azure API Management (APIM); el servidor Express incluido no atiende las operaciones del marketplace y solo ofrece salud.

## Componentes

- `app/frontend`: Angular 22 standalone, TypeScript, signals, formularios reactivos, RxJS y Vitest.
- `app/backend`: Express 5/TypeScript con `GET /api/health`.
- Azure APIM: API externa consumida por el navegador. Sus políticas e implementación no están en el repositorio.
- Google Identity Services: script remoto que entrega una credencial Google al navegador.
- Azure Static Web Apps y GitHub Actions: build/despliegue del frontend desde `main`.

## Capacidades observadas

| Capacidad | Estado | Evidencia |
|---|---|---|
| Navegación protegida | Verificado estáticamente | `app.routes.ts`, `auth.guard.ts` |
| Login Google | Verificado en cliente; validación remota no verificada | `google-auth.service.ts`, `index.html` |
| Credenciales institucionales | Maqueta no funcional | `login.ts:143-185` |
| Listado/detalle/creación | Consumidores implementados | `publication.service.ts` |
| Perfil | Consumidor implementado con usuario fijo | `profile.ts:24-25` |
| Mensajería | Lista y envío; historial completo no se solicita | `chat.service.ts`, `messenger.ts` |
| Carga de imágenes | Solo previsualización local; no forma parte del POST | `publication-create.ts:243-283,370-400` |
| Backend de negocio local | No implementado | `app/backend/src/app.ts` |

## Estado técnico

- **Verificado:** el backend compila con `npm run build`.
- **Verificado:** con un Node 24.21.0 ya instalado, los 18 archivos frontend ejecutaron 170 pruebas exitosas y `ngc --noEmit` completó.
- **No verificado por ejecución:** el build Angular de producción abortó con código 134 en este entorno incluso con Node compatible; el bundle y sus presupuestos no se certifican.
- **Verificado:** no hay pruebas backend ni configuración de lint.
- **Verificado:** README y `GOOGLE_LOGIN.md` contienen afirmaciones desactualizadas respecto del código actual; se detallan en las auditorías.

La [segunda validación](audits/SECOND_PASS_VALIDATION.md) revisa certeza y severidad de los 20 hallazgos iniciales.

## Límites no determinados

No están incluidos la implementación/políticas de APIM, persistencia, migraciones, autorización del servidor de datos, observabilidad de producción, esquema OpenAPI, infraestructura del backend ni métricas de cobertura. Por ello, la compatibilidad dinámica con Azure no se da por demostrada.

