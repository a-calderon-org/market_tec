# Iniciar sesión / Crear cuenta, contraseña institucional, Google en modo oscuro y favicon

Último incremento de autenticación y presentación de MarketTEC (frontend). Depende de **ms-users-market-tec PR #34**
(contraseñas, migración `V14`, política B02). No reabre la integración ms-users → ms-catalog ni toca ms-catalog / ms-notifications.

## Interfaz (`app/frontend/src/app/features/auth`)

* Selector visible **«Iniciar sesión / Crear cuenta»** (WAI-ARIA tabs, flechas izquierda/derecha). Cada operación tiene su
  formulario y su propósito de Google (intento y nonce propios; al cambiar se pide un intento nuevo).
* **Iniciar sesión**: correo institucional, contraseña (mostrar/ocultar), «Iniciar sesión», «Olvidé mi contraseña» y Google.
  `POST /v1/auth/password/login`; no pide Magic Link. Mensajes uniformes (`INVALID_CREDENTIALS`, `RATE_LIMITED`).
* **Crear cuenta**: «Continuar con correo institucional» (centrado, ancho máx. 400 px, 100 % en móvil) → «Enviar enlace de
  verificación» (Magic Link existente) → estado de envío → al confirmar el enlace, **configuración de la primera contraseña**
  (`/contrasena`, `POST /v1/me/password`, solo con la concesión de un solo uso que deja el enlace) → inicio de sesión posterior con
  correo y contraseña. Google sigue creando cuenta con su flujo existente.
* **Recuperación**: «Olvidé mi contraseña» → `POST /v1/auth/password/recovery/requests` (acuse idéntico para cualquier dirección) →
  enlace a `/acceso/recuperar`, que canjea con el mismo `POST /v1/auth/email/confirm`.
* Sin formulario simulado: el adaptador mock **nunca** simula contraseñas (rechaza con 503) y la UI de contraseña solo existe con
  `authCoreV2`, adaptador `http` y el flag `passwordAuth` (apagado por defecto; ver `environment.example.ts`). Sin él la pantalla conserva
  Google y el enlace por correo.

## B02 en la interfaz

Un enlace al buzón no prueba continuidad de la cuenta. Si la cuenta **ya tiene** contraseña, el enlace de recuperación responde
`409 CONTINUITY_REQUIRED` y la página de recuperación lo explica sin crear sesión ni reemplazar nada. No se vincula Google con la
cuenta institucional por coincidencia de correo. **Bloqueo real:** restablecer una contraseña existente requiere una prueba de continuidad
B02 aprobada (passkeys / códigos de recuperación, fuera de este incremento).

## Botón de Google (oscuro/claro)

Causa del recorte en Safari: `styles.scss` forzaba, solo en modo oscuro, `height: 39px`, `transform: translateY(-2px)`, un borde postizo
y `background-color … !important` sobre el contenedor y el iframe, y `login.scss` fijaba `height: 40px; overflow: hidden`. Se eliminó todo
eso; ya no se toca el interior ni el tamaño del componente oficial. Ahora se piden los **temas oficiales** `outline` / `filled_black`
(`outline_dark` no existe en GIS), el ancho sigue al contenedor dentro de los límites de GIS (200–400 px), el contenedor se centra y
declara `color-scheme` (iframe transparente). Un cambio de tema re-dibuja solo el botón con el **mismo intento** (`restyleButton`): sin
botón duplicado ni intento nuevo.

## Favicon y título

El logo oficial es el SVG del encabezado (`app.html`): se reutilizó tal cual en `public/favicon.svg`, `favicon.ico` (16/32/48) y
`apple-touch-icon.png`. Se reemplazó el logo de Angular. Título `MarketTEC`. Los `<link>` llevan `?v=2` para saltar la caché del navegador.

## Dependencias y límites conocidos

* **APIM**: las cinco rutas nuevas están preparadas en el manifiesto de staging (27 operaciones, ms-users `8707f03`) y en el
  perfil `ms-users-password-v1` mediante la extensión del generador (`--openapi-extension`, ver
  [`infra/apim/README.md`](../infra/apim/README.md)); `operations.json` y la matriz B07 de 22 operaciones no cambian. Estado
  **Proposed**: no están publicadas en Azure y el paquete no se genera hasta registrar evidencias `abuse_protection` y
  `ms_users_contract` aprobadas para `8707f03` ([`infra/apim/staging/README.md`](../infra/apim/staging/README.md)). **Sin esto no
  hay E2E en staging**. El contrato aditivo está en `contracts/openapi/users-password.json` (no modifica `users.json`).
* El proxy same-origin `/api/users` ya admite las rutas (patrón genérico, métodos GET/POST/PUT); no requirió cambios.
* El cambio de contraseña (`PUT /v1/me/password`) existe en ms-users pero esta SPA aún no lo consume (no está en el transporte restringido).
