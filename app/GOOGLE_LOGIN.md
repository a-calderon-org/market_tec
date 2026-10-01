# Acceso con Google

Se aceptan cuentas de Google de cualquier dominio con correo verificado. El botón oficial entrega una credencial al backend, que valida firma, audiencia y vencimiento con `google-auth-library`. La identidad usa el identificador `sub` de Google, no el correo como clave.

## Ejecutar localmente

1. En `frontend/src/environments/environment.ts`, configura `googleClientId` con el ID OAuth de una aplicación web. Ver `environment.example.ts`.
2. En Google Cloud / Google Auth Platform, agrega `http://localhost` y `http://localhost:4200` a los orígenes JavaScript autorizados del cliente web. Agrega también el dominio de Azure Static Web Apps usado por el frontend. Configura la audiencia externa y los usuarios de prueba si corresponde. No se necesita un Client Secret en el frontend.
3. Desde `app/frontend`, ejecuta `npm install` y `npm start`.
4. Abre `http://localhost:4200/login` y pulsa el botón de Google.

## Sesión y alcance

Todas las pantallas de la aplicación requieren un ID token vigente de Google. El frontend conserva el token en `sessionStorage` y lo envía como `Authorization: Bearer` a la API de Azure, que valida su firma, audiencia y vencimiento. El token se elimina al cerrar la pestaña, al expirar, al cerrar sesión o cuando la API responde `401`.

El formulario de credenciales TEC es únicamente una maqueta y no permite ingresar. El acceso funcional se realiza con el botón de Google.

La API de datos en Azure valida nuevamente el ID token recibido. El frontend utiliza el claim `sub` como identificador en `GET/PUT /usuarios/{id}` y `GET /usuarios/{id}/publicaciones`. Al crear una publicación también envía ese valor en `usuarioId`, para que Azure pueda asociar y devolver la información del vendedor. Los guards de Angular no sustituyen esa autorización del servidor.

## Verificar

Frontend: `npm run build` y `npm test -- --watch=false`.

Las pruebas locales comprueban el almacenamiento temporal del token, su vencimiento y los encabezados enviados a Azure. La comprobación completa del popup requiere una cuenta real y los orígenes autorizados en Google Cloud.

Referencia: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
