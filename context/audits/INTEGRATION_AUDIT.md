# Auditoría inicial de integración

Fecha: 2026-10-13. Estado: `30ff761`. Resultado: **0 Critical, 3 High, 3 Medium, 0 Low**. La revisión es estática; APIM no fue invocado.

## INT-001 — Backend local incompatible con todos los contratos de negocio

- **Severidad / categoría:** High / Disponibilidad e integración.
- **Descripción:** la SPA consume ocho operaciones; Express solo registra salud.
- **Evidencia:** `app/backend/src/app.ts:9-13`; `publication.service.ts:17-49`, `user.service.ts:13-31`, `chat.service.ts:14-33`.
- **Impacto:** no existe entorno full-stack local ni fallback verificable; el sistema depende de una API externa fuera del repositorio.
- **Recomendación:** declarar formalmente APIM como límite externo y versionar OpenAPI/contract tests, o implementar el backend acordado.
- **Verificación sugerida:** ejecutar smoke contractual contra el destino elegido.
- **Estado de validación:** incompatibilidad local confirmada; API externa no determinada.

## INT-002 — Documentación promete validación Google previa que el flujo no realiza

- **Severidad / categoría:** High / Autenticación y documentación.
- **Descripción:** `GOOGLE_LOGIN.md` afirma que el botón entrega credencial al backend y este valida antes del acceso; `signIn` solo guarda/decodifica y luego Login navega.
- **Evidencia:** `app/GOOGLE_LOGIN.md:3,17`; `google-auth.service.ts:68-78`; `login.ts:64-77`.
- **Impacto:** falsa expectativa de seguridad y pruebas que nombran una validación inexistente.
- **Recomendación:** implementar intercambio/validación de sesión o corregir documentación y nombres de prueba, manteniendo validación obligatoria en API.
- **Verificación sugerida:** traza de red durante login y prueba con token inválido.
- **Estado de validación:** contradicción confirmada; políticas de APIM no verificadas.

## INT-003 — Identidad autenticada y recursos de usuario no están conectados

- **Severidad / categoría:** High / Autorización y contratos.
- **Descripción:** la sesión usa `sub`, pero perfil/publicaciones usan `USR-001`; además la guía afirma que usan `sub`.
- **Evidencia:** `google-auth.service.ts:98-108`; `profile.ts:24-25`; `my-publications.ts:29`; `app/GOOGLE_LOGIN.md:21`.
- **Impacto:** identidad incoherente y posible acceso cruzado si el servidor confía en la ruta.
- **Recomendación:** contrato de identidad único y autorización server-side basada en token, con IDs de ruta validados o eliminados.
- **Verificación sugerida:** pruebas multiusuario de aislamiento y comparación `sub`/recurso.
- **Estado de validación:** divergencia confirmada; explotación no confirmada.

## INT-004 — Contrato de creación omite datos que la UI/documentación promete

- **Severidad / categoría:** Medium / Serialización y contrato.
- **Descripción:** no se envían imágenes ni `usuarioId`, aunque la UI selecciona imágenes y la guía dice que envía `usuarioId`.
- **Evidencia:** `publication-create.model.ts:1-9`; `publication-create.ts:370-400`; `app/GOOGLE_LOGIN.md:21`.
- **Impacto:** publicaciones sin asociación/imagen o dependencia de comportamiento implícito del API.
- **Recomendación:** acordar contrato explícito: servidor deriva usuario del token y define upload/URLs; alinear UI y guía.
- **Verificación sugerida:** contract test del POST y lectura posterior del recurso.
- **Estado de validación:** payload cliente confirmado; requisito remoto no determinado.

## INT-005 — Contratos solo tipados en compile-time y duplicados por vista

- **Severidad / categoría:** Medium / Mantenibilidad.
- **Descripción:** no hay OpenAPI, generación ni validación runtime; publicación tiene modelos distintos para lista, detalle y usuario.
- **Evidencia:** `features/publications/models/*.ts`; ausencia de especificación en archivos versionados.
- **Impacto:** cambios remotos o campos inválidos llegan a la UI sin detección temprana.
- **Recomendación:** versionar esquema autoritativo, generar/adaptar tipos y validar fronteras críticas.
- **Verificación sugerida:** contract tests con respuestas válidas, campos ausentes y tipos incorrectos.
- **Estado de validación:** arquitectura confirmada; fallos concretos de serialización no observados.

## INT-006 — Configuración backend y frontend describe destinos distintos sin vínculo

- **Severidad / categoría:** Medium / Configuración y operación.
- **Descripción:** backend documenta `API_BASE_URL` terminado en `/home`, pero no lo lee; frontend usa `apiBaseUrl` y concatena rutas. No existe proxy ni configuración común.
- **Evidencia:** `app/backend/.env.example:1-3`; `app/backend/src/server.ts:1-7`; `api-client.service.ts:12-40`.
- **Impacto:** operadores pueden creer que el backend enruta a APIM y obtener URLs duplicadas/incorrectas.
- **Recomendación:** eliminar configuración inerte al corregir producto o implementar/documentar el proxy con validación de URL.
- **Verificación sugerida:** prueba de configuración y traza de destino de cada solicitud.
- **Estado de validación:** variable no utilizada confirmada.

