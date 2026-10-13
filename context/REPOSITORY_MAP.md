# Mapa del repositorio

```text
market_tec/
├── .github/workflows/                 # CI/CD de Azure Static Web Apps
├── app/
│   ├── backend/                       # servidor Express mínimo
│   │   ├── src/app.ts                 # middleware y GET /api/health
│   │   ├── src/server.ts              # arranque y PORT
│   │   └── package.json, tsconfig.json
│   ├── frontend/                      # SPA Angular
│   │   ├── public/                    # favicon, placeholder y config SWA
│   │   ├── src/main.ts                # bootstrap
│   │   ├── src/environments/          # ejemplo; environment.ts es local/ignorado
│   │   └── src/app/
│   │       ├── app.*                  # shell y navegación
│   │       ├── core/api/              # cliente HTTP e interceptor
│   │       ├── core/auth/             # almacenamiento/decodificación del token
│   │       ├── features/auth/          # login Google y maqueta TEC
│   │       ├── features/home/          # catálogo, paginación y filtros
│   │       ├── features/messenger/     # conversaciones y envío
│   │       ├── features/profile/       # consulta/edición de perfil
│   │       ├── features/publications/  # detalle, alta y publicaciones propias
│   │       └── shared/                 # tarjeta y respuesta paginada
│   └── GOOGLE_LOGIN.md                # guía existente; contiene desfases
├── context/                           # contexto técnico mantenido
├── diagram_architecture.drawio        # diagrama existente, no validado como fuente
├── README.md                          # guía general, parcialmente desactualizada
└── AGENTS.md                          # punto de entrada para agentes
```

## Entradas y configuración

- Frontend: `app/frontend/src/main.ts`, `angular.json`, `package.json`.
- Backend: `app/backend/src/server.ts`, `package.json`, `tsconfig.json`.
- Despliegue: `.github/workflows/azure-static-web-apps-victorious-beach-0a55f0c1e.yml`.
- SPA routing: `app/frontend/public/staticwebapp.config.json`.
- Variables públicas de build: `apiBaseUrl`, `subscriptionKey`, `googleClientId` (esta última falta en el ejemplo versionado).
- Variables backend documentadas: `PORT`, `API_BASE_URL`, `API_SUBSCRIPTION_KEY`; solo `PORT` es leído por el código.

No se encontraron contenedores, base de datos, migraciones, OpenAPI, pruebas E2E configuradas ni scripts de infraestructura adicionales.

