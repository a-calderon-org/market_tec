# Flujo de desarrollo

## Requisitos observados

- `.nvmrc` solicita Node `24` y el README recomienda Node 24.
- npm administra dos proyectos independientes, sin workspace raíz.
- El frontend requiere un `src/environments/environment.ts` ignorado por Git o generado por CI.

## Comandos

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

## Configuración local

Crear el entorno a partir del esquema documentado en [dependencias frontend](frontend/DEPENDENCIES.md), sin versionar valores. El job de despliegue genera las tres propiedades desde secrets; la validación de PR usa valores ficticios. Nunca copiar valores a documentación o commits.

## Convenciones observadas

Angular standalone, servicios `providedIn: 'root'`, signals para estado y formularios reactivos. Tests colocados junto al código como `*.spec.ts`. Backend TypeScript estricto compilado a `dist/`.

## Despliegue

**Verificado en configuración:** el [workflow Azure](../.github/workflows/azure-static-web-apps-victorious-beach-0a55f0c1e.yml) valida el build Angular en PRs hacia `main` (`opened`, `synchronize`, `reopened`), incluidos Draft, con valores ficticios y sin referencias a secrets en el job de validación. Solo `push` a `refs/heads/main` habilita el job que genera `environment.ts` desde secrets, construye `app/frontend` y publica `dist/market-tec-frontend/browser` en Azure Static Web Apps. No despliega `app/backend`.

Se conserva la acción `close` al cerrar PRs del mismo repositorio cuyo actor no sea Dependabot para retirar previews anteriores; no publica artefactos ni se ejecuta al abrir o actualizar PRs. Deshabilitar nuevos previews no elimina los ya publicados. La [CLI oficial de Azure](https://learn.microsoft.com/en-us/cli/azure/staticwebapp/environment#az-staticwebapp-environment-delete) permite retirar un entorno concreto sin cerrar su PR, previa autorización y verificación de su nombre y recurso; no debe seleccionarse el entorno de producción `default`.
