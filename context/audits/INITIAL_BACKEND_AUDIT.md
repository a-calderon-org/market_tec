# Auditoría técnica inicial del backend

Fecha: 2026-10-13. Estado: `30ff761`. Alcance: `app/backend`; revisión estática y `npm run build`. Resultado: **0 Critical, 1 High, 3 Medium, 1 Low**.

## BE-001 — El backend local no implementa el dominio del producto

- **Severidad / categoría:** High / Arquitectura e integración.
- **Descripción:** solo existe salud; publicaciones, usuarios, chats y autenticación no están implementados. Puede ser una transición deliberada hacia APIM, pero el repositorio no contiene un backend de negocio autónomo.
- **Evidencia:** `app/backend/src/app.ts:4-13`; consumidores enumerados en `app/frontend/src/app/features/*/services/*.ts`.
- **Impacto:** desarrollo local no integrado, imposibilidad de auditar seguridad/datos del origen real y alta dependencia de infraestructura externa no versionada.
- **Recomendación:** definir explícitamente si este proyecto será health-check, proxy/BFF o API de negocio; versionar los contratos y desplegar/documentar el componente elegido.
- **Verificación sugerida:** prueba contractual que levante el backend y cubra cada endpoint requerido, o evidencia versionada de la API externa.
- **Estado de validación:** confirmado estáticamente; no se probó APIM.

## BE-002 — CORS sin restricción de orígenes

- **Severidad / categoría:** Medium / Seguridad y configuración.
- **Descripción:** `cors()` usa su política permisiva predeterminada. Con el endpoint actual de salud el impacto es limitado; aumentaría si se agregan rutas sensibles.
- **Evidencia:** `app/backend/src/app.ts:6`.
- **Impacto:** clientes web de cualquier origen podrían invocar futuras rutas conforme a CORS; no implica por sí solo omitir autorización del servidor.
- **Recomendación:** configurar allowlist por entorno antes de exponer datos o mutaciones.
- **Verificación sugerida:** tests OPTIONS/Origin para orígenes permitidos y rechazados.
- **Estado de validación:** configuración confirmada; explotación no afirmada.

## BE-003 — Sin pruebas ni controles de calidad backend

- **Severidad / categoría:** Medium / Testing.
- **Descripción:** no hay archivos de prueba ni scripts `test`/`lint`.
- **Evidencia:** `app/backend/package.json:7-11`; inventario completo de `app/backend/src`.
- **Impacto:** regresiones de rutas/middleware y cambios de seguridad pueden pasar sin detección.
- **Recomendación:** incorporar pruebas HTTP del app exportado, cobertura de configuración/errores y lint en CI.
- **Verificación sugerida:** ejecutar scripts no interactivos y comprobar casos 200, 404, CORS y error.
- **Estado de validación:** confirmado por manifiesto e inventario.

## BE-004 — Script de desarrollo apunta a un archivo inexistente

- **Severidad / categoría:** Medium / Operación.
- **Descripción:** `tsx watch src/server.js` no coincide con `src/server.ts`.
- **Evidencia:** `app/backend/package.json:8`; `app/backend/src/server.ts`.
- **Impacto:** onboarding y ciclo local pueden fallar o observar un archivo equivocado.
- **Recomendación:** alinear el script con la fuente y añadir una verificación de arranque acotada.
- **Verificación sugerida:** ejecutar el script corregido y solicitar `/api/health`.
- **Estado de validación:** discrepancia estática confirmada; comando persistente no ejecutado.

## BE-005 — Operación mínima sin validación ni observabilidad estructurada

- **Severidad / categoría:** Low / Confiabilidad operativa.
- **Descripción:** `PORT` no se valida, solo hay `console.log`, no hay middleware de 404/error ni cierre controlado.
- **Evidencia:** `app/backend/src/server.ts:4-7`, `app/backend/src/app.ts:4-13`.
- **Impacto:** diagnósticos y comportamiento ante configuración/fallos serían pobres al crecer el servicio.
- **Recomendación:** validar configuración al inicio, definir errores/logs y shutdown cuando el backend adquiera responsabilidades reales.
- **Verificación sugerida:** pruebas con puerto inválido, ruta desconocida y señales del proceso.
- **Estado de validación:** ausencias confirmadas; riesgo futuro condicionado al alcance.

## Verificaciones y límites

`npm run build` terminó con éxito. Se intentó un smoke local con `PORT=43117 node dist/server.js` y `curl`: apareció el mensaje de arranque, pero el proceso terminó/no fue alcanzable en el entorno aislado, por lo que el endpoint no se declara verificado en ejecución. No se instalaron paquetes. Persistencia, autorización y vulnerabilidades del API externo son **no determinadas**, no fallos confirmados del backend local.

