# Flujo de desarrollo

## Requisitos observados

- `.nvmrc` solicita Node `24` y el README recomienda Node 24.
- npm administra dos proyectos independientes, sin workspace raíz.
- El frontend requiere un `src/environments/environment.ts` ignorado por Git o generado por CI.

## Comandos

Para `app/ms-catalog`, `npm ci` instala dependencias fijadas y `npm run check`
comprueba tipos, compila y ejecuta pruebas, incluidas respuestas HTTP verificadas
con Ajv/ajv-formats. Prueba manual y coleccion Postman en
[README de catalogo](../app/ms-catalog/README.md). Esto no cambia el flujo Git ni
los workflows de CI/despliegue existentes.

| Área | Comando (desde su directorio) | Estado 2026-10-13 |
|---|---|---|
| Backend | `npm run build` | Exitoso |
| Backend | `npm run dev` | Watch no verificable por IPC del sandbox; el specifier `src/server.js` sí fue resuelto por `tsx` hacia TypeScript mediante `node --import tsx src/server.js` |
| Backend | `PORT=43117 node dist/server.js` + `curl` | Mostró el mensaje de arranque, pero el proceso terminó/no fue alcanzable desde `curl` en el entorno aislado; endpoint no verificado en ejecución |
| Frontend | `npm start` | No ejecutado; servidor persistente |
| Frontend | `ngc -p tsconfig.app.json --noEmit` con Node 24.21.0 | Exitoso |
| Frontend | `ng test --watch=false` con Node 24.21.0 | Exitoso: 19 archivos, 179 pruebas |
| Frontend | `ng build` con Node 24.21.0 y salida en `/tmp` | Abortó con código 134 en production y development, también con un worker. Causa no determinada |

No hay scripts `lint`, cobertura ni E2E configurados. `npm ci` está documentado, pero no se ejecutó porque las dependencias ya estaban presentes y la tarea prohíbe instalaciones. Los Node instalados detectados fueron 22.22.0, 24.14.0 y 24.21.0; este último se invocó por ruta absoluta sin alterar configuración persistente.

**Verificación MTEC-41 (2026-11-04):** `npm ci` y 205 pruebas Angular completaron con Node 24.21.0 en un worktree aislado. `npm run build` terminó con éxito fuera del sandbox local; dentro de él abortó con código 134. El artefacto de producción pasó la comprobación de ausencia de referencias a la subscription key. El CI remoto del PR debe confirmar el mismo resultado antes del merge.

## Configuración local

Crear el entorno a partir del esquema documentado en [dependencias frontend](frontend/DEPENDENCIES.md), sin versionar valores. La validación de PR, push y despacho manual usa valores ficticios; solo el job protegido de despliegue genera `apiBaseUrl` y `googleClientId` desde secrets. El workflow no lee la subscription key de APIM y verifica que ambos artefactos no contengan sus identificadores. Nunca copiar valores a documentación o commits.

## Convenciones observadas

Angular standalone, servicios `providedIn: 'root'`, signals para estado y formularios reactivos. Tests colocados junto al código como `*.spec.ts`. Backend TypeScript estricto compilado a `dist/`.

## Despliegue

**Verificado en configuración:** el [workflow Azure](../.github/workflows/azure-static-web-apps-victorious-beach-0a55f0c1e.yml) instala dependencias, ejecuta pruebas y build Angular, y comprueba el artefacto en PRs hacia `main`, pushes a `main` y despachos manuales. PR y push no ejecutan la acción de Azure ni crean previews; cerrar un PR tampoco activa el workflow. El job de validación solo tiene permiso `contents: read` y no referencia secrets.

El despliegue manual está **bloqueado incondicionalmente** por `false` en la condición del job. Para habilitarlo mediante un cambio revisado, primero debe comprobarse que el entorno `swa-production` tiene revisores obligatorios, restricción a `main`, revisión propia impedida y los tres secrets de compilación/publicación configurados **solo en ese entorno**; además, debe verificarse la compatibilidad real con APIM. Tras retirar esa condición de bloqueo, el job exige `workflow_dispatch` desde `main`, el SHA completo del commit de `main` aprobado, confirmación de compatibilidad APIM y la variable de repositorio `MTEC41_SWA_DEPLOY_ENABLED=true`. El job protegido vuelve a construir el SHA aprobado y rechaza referencias a la subscription key antes de publicar. **No determinado:** las reglas efectivas del entorno y el estado de la variable en GitHub. El workflow no despliega `app/backend`.
