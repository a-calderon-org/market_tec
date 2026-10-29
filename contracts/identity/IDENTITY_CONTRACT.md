# Contrato conceptual de identidad compartida

**Estado:** Propuesta pendiente de aprobación
**Versión de diseño:** 0.1.0-draft
**Relacionado con:** MTEC-10, MTEC-12 y MTEC-15

## 1. Hechos y límites confirmados

- MarketTec es una aplicación web.
- Google Identity Services entrega actualmente un ID token al navegador.
- `userId` será el identificador lógico estable compartido por los servicios.
- Google `sub` no es el identificador de base de datos ni debe exponerse como tal.
- Un servicio no puede leer la base de datos de otro servicio.
- Un header de identidad enviado por el navegador no constituye autenticación.

El flujo `Google ID token -> ms-users -> JWT interno -> APIM -> servicios` sigue
siendo una recomendación arquitectónica; no está implementado ni aprobado.

## 2. Identidad interna propuesta

| Elemento | Contrato mínimo | Estado |
|---|---|---|
| `userId` | String opaco, estable, no vacío, máximo 64 caracteres | Recomendado para aprobación |
| Generador | Exclusivamente `ms-users` | Recomendado para aprobación |
| Semántica | No contiene correo, carrera, rol ni Google `sub` | Recomendado para aprobación |
| Mapping externo | Clave única `(issuer, subject)` de Google -> `userId` | Recomendado para aprobación |
| Formato físico | UUID/ULID/prefijo interno; consumidores no deben interpretarlo | Pendiente |

El contrato solo garantiza que `userId` es un string opaco. Un servicio consumidor
puede almacenarlo como referencia, pero no debe inferir proveedor, fecha o permisos
a partir de su formato.

### Usuarios inexistentes

Después de verificar firma, issuer, audience, expiración y dominio institucional,
`ms-users` debe aplicar una política explícita:

1. crear y vincular automáticamente el usuario; o
2. rechazar con un error de registro requerido.

Se recomienda alta idempotente durante el intercambio inicial, pero esta política
permanece pendiente de aprobación. En ningún caso se crea una identidad a partir de
claims no verificados por el servidor.

## 3. Reglas de propiedad

- `ms-users` posee cuentas, perfiles y mappings de identidad externa.
- `ms-catalog` deriva el propietario de una publicación o participante de chat del
  `AuthenticatedPrincipal`; no acepta `vendedorId` o `senderId` como autoridad desde
  el body.
- `ms-notifications` limita consultas al `userId` autenticado y usa el destinatario
  incluido en eventos validados.
- Los IDs de ruta pueden seleccionar un recurso, pero la autorización siempre
  compara su propietario con el principal autenticado.

## 4. JWT interno recomendado

| Claim o propiedad | Recomendación | Estado |
|---|---|---|
| `iss` | Valor estable configurable, por ejemplo `markettec/ms-users` | Pendiente |
| `aud` | `markettec-api` o audiencias por servicio | Pendiente |
| `sub` | `userId` interno opaco | Recomendado para aprobación |
| `iat` | Epoch seconds de emisión | Recomendado para aprobación |
| `exp` | Epoch seconds; vida útil inicial sugerida de 15 minutos | Pendiente |
| `jti` | UUID único para trazabilidad/revocación futura | Recomendado |
| `scope` | Solo capacidades realmente autorizadas; sin rol admin implícito | Pendiente |
| Algoritmo | Firma asimétrica RS256 con allowlist explícita | Pendiente |
| Claves | JWKS publicado por ms-users; `kid`, rotación y solapamiento | Pendiente |

No se recomienda almacenar una clave simétrica compartida en los tres servicios.
La renovación debe volver a demostrar una sesión Google válida o usar un mecanismo
de refresh diseñado posteriormente. Esta propuesta no crea refresh tokens.

## 5. Frontera de confianza

APIM debe validar, como mínimo, firma, algoritmo permitido, `iss`, `aud`, `exp` y
`nbf` cuando exista. Además debe eliminar cualquier header de identidad enviado por
el cliente antes de enrutar la solicitud.

La opción preferida es reenviar el JWT validado y que cada adaptador HTTP vuelva a
validarlo o verifique una credencial interna firmada. Si se materializan headers
internos, APIM debe sobrescribirlos y el backend debe ser inaccesible directamente
mediante mTLS/restricciones de red. Nunca se usa `X-User-Id` del navegador.

### Puerto conceptual independiente del framework

```text
AuthenticatedPrincipal
  userId: string
  tokenId: string | null
  issuedAt: integer (Epoch seconds)
  expiresAt: integer (Epoch seconds)
  scopes: set<string>
```

El adaptador de seguridad de Spring, Express o FastAPI construye este valor solo
después de validar la credencial. Los casos de uso reciben el principal como entrada
y no leen headers, objetos HTTP ni claims Google.

## 6. Intercambio de Google ID Token

Contrato propuesto en `openapi/users.json`:

```text
POST /v1/auth/google
request:  { credential: string }
response: { token, tokenType: "Bearer", expiresAt, user }
```

La ruta es nueva y está marcada `proposed`. Angular todavía guarda el ID token de
Google directamente, por lo que adoptar este intercambio requiere un cambio
coordinado. El documento no afirma que APIM o ms-users ya lo soporten.
