# Deuda técnica priorizada

Consolidación viva revisada el 2026-10-13 mediante [SECOND_PASS_VALIDATION.md](SECOND_PASS_VALIDATION.md). Las auditorías iniciales permanecen históricas. Prioridad combina certeza, impacto, dependencias y urgencia; la severidad revisada está en la segunda pasada.

## P0 — Crítico

No se confirmó un hallazgo que justifique P0 con evidencia local.

## P1 — Bloqueos antes de una entrega productiva

| ID | Clase | Problema / riesgo | Acción | Esfuerzo | Dependencias |
|---|---|---|---|---|---|
| FE-001 / INT-002 | Riesgo externo + defecto documental | El cliente confía en claims no verificados y la guía promete validación previa inexistente | obtener políticas APIM, decidir flujo de sesión, corregir guía y añadir pruebas negativas | Medio-Alto | APIM/origen/Google |
| FE-002 / INT-003 | Defecto local + riesgo externo | `USR-001` desacoplado de la cuenta; el impacto de acceso depende del servidor | definir identidad contractual y demostrar autorización multiusuario | Medio | API/ownership |
| Verificación de build | Entorno/release | 179 tests y typecheck pasan, pero `ng build` todavía aborta con exit 134 | reproducir en CI limpio, fijar toolchain y validar presupuestos | Medio | entorno CI |

## P2 — Correcciones funcionales y de contrato

| ID | Clase | Problema / riesgo | Acción | Esfuerzo | Dependencias |
|---|---|---|---|---|---|
| Escalabilidad de catálogo Home | Limitación contractual | el filtrado global exige recorrer todas las páginas porque APIM no documenta filtros server-side; el cliente solicita lotes de 100, cancela recargas y valida completitud, pero el costo crece con el catálogo | definir filtros/orden/paginación server-side y versionarlos en OpenAPI | Medio | contrato de catálogo/APIM |
| SPV-001 | Defecto local | paginación de publicaciones propias es inerte y chats descarta metadatos | implementar query/navegación o cambiar contrato a no paginado | Medio | API externa |
| INT-005 | Decisión arquitectónica | sin contrato versionado ni validación runtime | OpenAPI/esquemas y contract tests | Medio | proveedor API |
| FE-007 | Defecto local de accesibilidad | panel de perfil sin patrón modal/foco | semántica, focus trap, Escape y pruebas | Bajo-Medio | ninguna |
| FE-003 | Riesgo externo | subscription key pública; impacto depende de políticas | revisar alcance/cuotas y no tratarla como secreto | Medio | APIM |
| FE-008 / BE-003 | Mejora de calidad | faltan E2E/a11y y tests backend | cubrir flujos/contratos críticos, proporcional al rol Express | Medio | CI y contratos |

## P3 — Mantenimiento y endurecimiento

| ID | Clase | Problema / riesgo | Acción | Esfuerzo | Dependencias |
|---|---|---|---|---|---|
| FE-006 | Defecto local | ejemplo de entorno omite `googleClientId` | ejemplo/esquema completo | Bajo | ninguna |
| FE-009 | Mejora local | errores no 401 inconsistentes | sobre y política común | Medio | contrato API |
| SPV-003 | Resuelto 2026-10-29 | interceptor valida `URL.origin` y ruta delimitada; configuración inválida falla cerrada | conservar pruebas negativas de destinos/configuración | Bajo residual | ninguna |
| SPV-004 | Resuelto 2026-10-29 | fuente reactiva programa `exp`, sincroniza usuario y protege contra 401/timers obsoletos | conservar pruebas con reloj simulado y concurrencia | Bajo residual | ninguna |
| INT-004 / FE-005 | Limitación documentada | imágenes son preview y `usuarioId` documentado no se envía | alinear contrato/guía; diseñar upload solo si entra en alcance | Variable | producto/API |
| BE-002 / BE-005 / INT-006 | Deuda condicionada | CORS/operación/config residual de Express | endurecer o retirar al decidir su papel | Bajo-Medio | decisión sobre backend |

## Trazabilidad de correcciones de la auditoría

- **FE-004 / SPV-002 queda cerrado funcionalmente tras la depuración y verificación manual del 2026-10-13:** Home reúne y valida el catálogo completo, deriva las opciones de categoría de los valores exactos del catálogo, combina búsqueda y filtros antes de paginar, calcula totales desde las coincidencias y mantiene un historial persistente operable con ratón y teclado. La integración real con APIM permanece **No determinada** porque el GET de inspección respondió 401 sin bearer; también permanece la limitación de escalabilidad hasta disponer de filtros server-side documentados.
- **SPV-003 / SPV-004 quedan cerrados localmente el 2026-10-29:** pruebas unitarias verifican origen/protocolo/puerto/ruta, configuración vacía o inválida, URLs relativas, expiración activa, logout, reemplazo de token, 401 concurrente y 401 tardío. **No determinado:** las políticas APIM y el enforcement remoto, que permanecen fuera del repositorio.
- **BE-004 fue refutado:** `tsx` sí resuelve `src/server.js`; no es deuda vigente.
- **BE-001/INT-001 bajan de prioridad:** README confirma que APIM mocks son la arquitectura de Fase I y Express está reservado.
- La ausencia de upload de imágenes no es pérdida silenciosa: la UI lo identifica como preview de sesión.

## Orden sugerido

1. Obtener evidencia de APIM/origen y cerrar el modelo de identidad/autorización.
2. Reproducir el build de producción en CI limpio.
3. Definir filtrado server-side escalable y corregir identidad fija con contract tests.
4. Versionar contratos y alinear documentación de autenticación/alta.
5. Atender accesibilidad, E2E y endurecimiento de cliente.
6. Decidir el futuro de Express antes de invertir en su operación.
