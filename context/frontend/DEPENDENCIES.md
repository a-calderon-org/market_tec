# Frontend: dependencias y configuración

## Base técnica

Angular 22.2 (`core`, `router`, `forms`, `common`, `platform-browser`), RxJS 7.8 y `tslib`. Build con Angular CLI/build, TypeScript 6, Vitest y jsdom. No se declaró biblioteca de UI, store, i18n o E2E.

## Entorno esperado

```ts
export const environment = {
  apiBaseUrl: '...',
  subscriptionKey: '...',
  googleClientId: '...'
};
```

El workflow genera esas tres propiedades. `environment.example.ts` solo contiene las primeras dos y, por tanto, no es una plantilla completa del código actual.

La subscription key queda embebida en el JavaScript servido al navegador; debe tratarse como identificador público/restringido, no como secreto. Su alcance y cuotas en APIM no están disponibles para verificación.

## Build y calidad

Hay 19 archivos `*.spec.ts`. Con Node 24.21.0 ya instalado, los 179 tests y `ngc --noEmit` terminaron con éxito. El build abortó con código 134 en production y development, incluso limitado a un worker, por lo que no se verificaron bundle ni presupuestos. `angular.json` fija 500 kB/1 MB inicial y 8/12 kB por estilo de componente.
