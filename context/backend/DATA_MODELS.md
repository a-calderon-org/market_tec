# Backend: modelos de datos

Los documentos de publicaciones de ms-catalog persisten `estado` junto con
su revisión. Los documentos anteriores sin ese campo se leen como `activo`.

**Verificado:** el backend local no declara modelos, esquemas, validadores, repositorios, migraciones ni conexión a base de datos.

Los interfaces TypeScript del frontend describen la forma que espera del API externo, pero no son modelos backend ni validan respuestas en ejecución. Se resumen en [flujo de datos](../integration/DATA_FLOW.md).

**No determinado:** motor de persistencia, integridad referencial, transacciones, concurrencia, migraciones y propiedad de datos de la API detrás de APIM.

