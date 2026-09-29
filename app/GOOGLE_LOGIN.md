# Acceso con Google

Se aceptan cuentas de Google de cualquier dominio con correo verificado. El botón oficial entrega una credencial al backend, que valida firma, audiencia y vencimiento con `google-auth-library`. La identidad usa el identificador `sub` de Google, no el correo como clave.

## Ejecutar localmente

1. En `frontend/src/environments/environment.ts`, configura `googleClientId` con el ID OAuth de una aplicación web. Ver `environment.example.ts`.
2. En `backend/.env`, configura `GOOGLE_CLIENT_ID` con el mismo valor y `FRONTEND_ORIGIN=http://localhost:4200`. Ver `.env.example`.
3. En Google Cloud / Google Auth Platform, agrega `http://localhost` y `http://localhost:4200` a los orígenes JavaScript autorizados del cliente web. Configura la audiencia externa y los usuarios de prueba si corresponde. No se necesita un Client Secret en el frontend.
4. En una terminal, desde `app/backend`, ejecuta `npm install` y `npm run dev`.
5. En otra, desde `app/frontend`, ejecuta `npm install` y `npm start`. Reinicia el servidor Angular si ya estaba abierto, para cargar el proxy nuevo.
6. Abre `http://localhost:4200/login` y pulsa el botón de Google.

El proxy de Angular envía `/api/auth/**` al puerto 3000. Si el puerto cambia, actualiza `frontend/proxy.conf.json`.

## Sesión y alcance

La cookie de sesión es HttpOnly, SameSite=Lax y dura ocho horas. `/api/auth/me` restaura la identidad y `/api/auth/logout` destruye la sesión. Las rutas de perfil, mensajes y edición de publicaciones requieren esta sesión. El catálogo es público. El formulario de credenciales TEC existente es un prototipo y no crea sesiones del backend.

El backend local guarda sesiones en memoria: reiniciarlo cierra las sesiones. Para producción se necesita un almacén persistente compartido, un `SESSION_SECRET` aleatorio, HTTPS y un proxy del mismo origen para `/api/auth/**`. Configura la confianza en el proxy según tu infraestructura si este termina TLS. Añade también el origen de producción al cliente Google y a `FRONTEND_ORIGIN`.

La API de datos en Azure y sus IDs de usuario de demostración (como `USR-001`) no están vinculados a las cuentas Google. Esta integración autentica la cuenta; asociarla con perfiles y autorizar operaciones de datos requiere cambios en esa API. Los guards de Angular no sustituyen esa autorización del servidor.

## Verificar

Backend: `npm run build` y `node --test test/auth.test.cjs`.
Frontend: `npm run build` y `npm test -- --watch=false`.

Las pruebas locales simulan la respuesta del verificador de Google y comprueban rechazos, sesión y logout. La comprobación completa del popup requiere una cuenta real y los orígenes autorizados en Google Cloud.

Referencia: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
