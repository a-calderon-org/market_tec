# Reglas de mantenimiento del contexto

1. Código, configuración y resultados de ejecución prevalecen sobre prosa.
2. Fechar auditorías y conservarlas como evidencia histórica; no editar hallazgos antiguos para simular que nunca existieron.
3. Etiquetar certeza: **Verificado**, **Inferido**, **No determinado** o **Documentado pero no verificado**.
4. Citar rutas y, en auditorías, líneas estables cuando sea útil. Actualizarlas si el archivo cambia.
5. No copiar secretos, tokens, claves ni contenido de `.env`.
6. Mantener enlaces relativos válidos y evitar duplicar detalles: enlazar al documento dueño.
7. Separar estado actual (`OVERVIEW`, arquitectura, contratos) de historia (`decisions`) y evaluación fechada (`audits`).
8. Si el código contradice el contexto, corregir el documento en la misma tarea o marcar explícitamente el desfase.
9. Informar en el cierre qué contexto cambió y qué verificaciones sustentan el cambio.

