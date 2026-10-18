# ms-catalog

Fundacion ejecutable del servicio de catalogo de MarketTec. Usa Node.js 24 (la version declarada en el `.nvmrc` de la raiz), TypeScript y Express 5. No contiene publicaciones, chats ni integraciones Azure.

## Requisitos y ejecucion

```bash
nvm use
cd app/ms-catalog
npm ci
PORT=3000 SERVICE_NAME=ms-catalog npm run dev
curl -i http://localhost:3000/health
```

Verificaciones y ejecucion compilada:

```bash
npm run typecheck
npm run build
npm test
npm start
```

## Arquitectura implementada

El router HTTP de salud es un adaptador de entrada que invoca `GetHealthQuery`; `GetHealthService` implementa ese puerto y devuelve el modelo sin dependencias `ServiceHealth`. `config/container.ts` realiza la composicion manual. No se crean puertos de salida sin comportamiento real.

Las rutas de negocio futuras usarán `/v1`. Cosmos DB, Blob Storage y Azure Queue se incorporarán mediante puertos de salida cuando existan casos de uso. El middleware propaga o genera `X-Correlation-ID`, emite logs JSON, serializa timestamps en Epoch seconds y devuelve errores mediante un envelope estable.
