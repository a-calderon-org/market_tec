# Guía para agentes

- Antes de cambios relevantes, leer `context/README.md` y la documentación del área afectada.
- Usar el código y la configuración como fuente principal; contrastar siempre el contexto y señalar cualquier desfase.
- Identificar contratos, consumidores e integraciones afectados antes de modificar una API, modelo, ruta o configuración.
- Actualizar los documentos de `context/` cuando el cambio altere hechos allí descritos. Seguir `context/maintenance/UPDATE_PROTOCOL.md`.
- Registrar decisiones arquitectónicas significativas mediante el sistema de `context/decisions/`; no inventar decisiones históricas.
- Tratar `context/audits/INITIAL_*` como registros históricos fechados; consultar la validación más reciente y `TECHNICAL_DEBT.md` para el estado revisado.
- No presentar como vigente documentación contradicha por el código. Mantener las etiquetas **Verificado**, **Inferido**, **No determinado** y **Documentado pero no verificado** cuando correspondan.
- Preservar las convenciones comprobadas y los cambios preexistentes del usuario.
- Ejecutar verificaciones proporcionales al cambio y comunicar las que no pudieron ejecutarse.
- Al finalizar, indicar qué documentos de contexto se actualizaron o por qué no fue necesario actualizarlos.

