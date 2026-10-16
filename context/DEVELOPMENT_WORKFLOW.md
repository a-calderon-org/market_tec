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

Crear el entorno a partir del esquema documentado en [dependencias frontend](frontend/DEPENDENCIES.md), sin versionar valores. El workflow genera las tres propiedades desde secrets. Nunca copiar valores a documentación o commits.

## Convenciones observadas

Angular standalone, servicios `providedIn: 'root'`, signals para estado y formularios reactivos. Tests colocados junto al código como `*.spec.ts`. Backend TypeScript estricto compilado a `dist/`.

## Despliegue

El workflow se activa en push/PR hacia `main`, genera `environment.ts`, construye `app/frontend` y publica `dist/market-tec-frontend/browser` en Azure Static Web Apps. No despliega `app/backend`.
