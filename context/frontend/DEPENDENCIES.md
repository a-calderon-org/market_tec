# Frontend: dependencias y configuración

## Base técnica

Angular 22.2 (`core`, `router`, `forms`, `common`, `platform-browser`), RxJS 7.8 y `tslib`. Build con Angular CLI/build, TypeScript 6, Vitest y jsdom. No se declaró biblioteca de UI, store, i18n o E2E.

## Entorno esperado

```ts
export const environment = {
  apiBaseUrl: '...',
  googleClientId: '...'
};
```

El workflow genera esas dos propiedades. `environment.example.ts` contiene el mismo esquema sin valores de despliegue.

El frontend no incorpora ni envía la subscription key de APIM. El build de CI rechaza artefactos con referencias a esa credencial. APIM aún requiere suscripción en la API observada; el despliegue del cliente modificado requiere adaptar y probar la admisión en APIM.

## Build y calidad

Hay 19 archivos `*.spec.ts`. En la verificación de MTEC-41 con Node 24.21.0 pasaron 205 pruebas y el build de producción terminó con éxito fuera del sandbox local; dentro del sandbox abortó con código 134. El artefacto no contiene los identificadores de la subscription key. El build avisó de dos estilos por encima del presupuesto de advertencia. `angular.json` fija 500 kB/1 MB inicial y 8/12 kB por estilo de componente.
