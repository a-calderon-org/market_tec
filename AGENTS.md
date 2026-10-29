# Gobernanza y guía para agentes de desarrollo

Este documento establece las reglas obligatorias de gobernanza para cualquier agente de inteligencia artificial (o colaborador automatizado) que opere en el repositorio MarketTec. Estas reglas son neutrales respecto a la herramienta utilizada y aplicables a cualquier desarrollador.

---

## Reglas principales de gobernanza

### 1. Fuente de verdad
El código fuente ejecutable, la configuración real, los contratos compartidos versionados (`contracts/`), los ADR aprobados (`context/decisions/`) y los tickets vigentes de Jira tienen precedencia absoluta sobre prosas conversacionales, resúmenes informales o suposiciones heredadas. Contrasta siempre la documentación con el código y señala cualquier desfase técnico.

### 2. Prohibición de memoria conversacional
El repositorio **no** debe utilizarse como almacenamiento de conversaciones entre asistentes, transcripciones de sesiones, prompts temporales, checkpoints entre modelos ni historiales de razonamiento. Queda estrictamente prohibido versionar archivos o fragmentos cuyo propósito sea transportar contexto conversacional entre agentes ("Codex decidió...", "Gemini debe continuar...", etc.).

### 3. Documentación técnica únicamente
Cualquier documento nuevo o modificado debe tener una finalidad técnica concreta, un destinatario claro (desarrollador/mantenedor) y contenido empíricamente verificable. Los informes generados por IA solo se conservan si constituyen **auditorías técnicas reales** con: alcance, metodología, evidencia, resultados, limitaciones, riesgos y acciones pendientes; nunca diálogo o notas de sesión.

### 4. Cambios mínimos y focalizados
Modifica únicamente lo necesario para satisfacer el requerimiento solicitado. Preserva las convenciones comprobadas del proyecto, los comentarios existentes y los cambios locales preexistentes no confirmados.

### 5. Decisiones arquitectónicas explícitas
No apruebes ADRs, no alteres contratos inter-servicio ni tomes decisiones sobre almacenamiento productivo, seguridad, esquemas JWT o topología sin la aprobación formal del responsable del proyecto. Cualquier propuesta debe documentarse como `Proposed` hasta recibir validación oficial.

### 6. Protección estricta de Git
Salvo autorización expresa y deliberada del usuario:
- **No ejecutar:** `git add`, `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git clean`, `git switch` ni `git checkout`.
- **No crear ramas**, no alterar el staging ni modificar el historial Git.
- Todos los cambios deben permanecer locales, sin confirmar y listos para revisión y staging por parte del mantenedor.

### 7. Mantenimiento sin proliferación documental
Si un cambio técnico altera hechos descritos en `context/`, actualiza exclusivamente los documentos afectados siguiendo la matriz de impacto de [`context/maintenance/UPDATE_PROTOCOL.md`](context/maintenance/UPDATE_PROTOCOL.md). No crees nuevos reportes históricos por cada ejecución ni dupliques registros. Al finalizar cada sesión, reporta de manera concisa qué documentos se actualizaron o por qué no fue necesario modificarlos.

### 8. Neutralidad y ausencia de duplicación
Expresa las instrucciones y directrices en un lenguaje técnico neutral, comprensible para desarrolladores humanos y modelos de IA por igual. No dupliques directrices en múltiples archivos; enlaza siempre al documento canónico o dueño de la información.

---

## Flujo de trabajo estándar

1. **Lectura dirigida:** Antes de modificar un componente, lee [`context/README.md`](context/README.md) y la documentación del área afectada.
2. **Evaluación de impacto:** Identifica contratos, consumidores e integraciones antes de alterar APIs, modelos, rutas o configuraciones.
3. **Etiquetado de certeza:** Mantén las etiquetas **Verificado**, **Inferido**, **No determinado** y **Documentado pero no verificado** en auditorías y notas técnicas.
4. **Validación obligatoria:** Ejecuta verificaciones reproducibles proporcionales al cambio (pruebas unitarias, linters, validación de contratos) y reporta explícitamente cualquier validación que no haya podido ejecutarse.
