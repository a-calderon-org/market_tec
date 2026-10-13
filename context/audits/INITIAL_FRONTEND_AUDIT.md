# Auditoría técnica inicial del frontend

Fecha: 2026-10-13. Estado: `30ff761`. Revisión estática; build/tests bloqueados por versión de Node. Resultado: **0 Critical, 2 High, 5 Medium, 2 Low**.

## FE-001 — El cliente acepta identidad Google sin verificar firma ni audiencia

- **Severidad / categoría:** High / Seguridad y autenticación.
- **Descripción:** cualquier valor con forma JWT, claims `sub/email` y `exp` futuro pasa la sesión local. `signIn` no consulta un verificador remoto.
- **Evidencia:** `auth-token.service.ts:40-63`; `google-auth.service.ts:68-78`; `auth.guard.ts:5-17`.
- **Impacto:** un token fabricado desbloquea rutas y suplanta identidad visual. La API aún puede proteger los datos si valida correctamente, pero eso no es verificable aquí.
- **Recomendación:** establecer sesión desde una respuesta de backend que verifique firma, `aud`, `iss` y expiración; tratar el guard solo como UX.
- **Verificación sugerida:** E2E con JWT autofirmado debe permanecer en login y el API debe responder 401.
- **Estado de validación:** bypass cliente confirmado por código; acceso indebido al API no confirmado.

## FE-002 — Perfil y publicaciones propias usan el usuario fijo `USR-001`

- **Severidad / categoría:** High / Autorización e integridad funcional.
- **Descripción:** el `sub` de Google no alimenta las rutas dependientes del usuario.
- **Evidencia:** `profile.ts:24-25,149-152,237-240`; `my-publications.ts:29,185-188`.
- **Impacto:** todas las cuentas solicitan el mismo recurso; si el API no impone propiedad, podría haber exposición/modificación cruzada. Incluso con autorización correcta, usuarios válidos recibirán errores o datos incorrectos.
- **Recomendación:** derivar el sujeto del contexto autenticado y hacer que el servidor determine/valide la propiedad, evitando IDs confiados desde cliente.
- **Verificación sugerida:** probar dos cuentas y confirmar aislamiento en GET/PUT y publicaciones propias.
- **Estado de validación:** ID fijo confirmado; comportamiento de autorización remoto no determinado.

## FE-003 — La clave APIM se distribuye en el bundle del navegador

- **Severidad / categoría:** Medium / Seguridad de configuración.
- **Descripción:** `subscriptionKey` se inyecta como entorno Angular y se añade a todas las llamadas del API. Cualquier usuario puede leerla en red o bundle.
- **Evidencia:** `api-key.interceptor.ts:16-18`; workflow, paso “Create Angular environment”.
- **Impacto:** reutilización de la clave, consumo de cuota o pérdida de trazabilidad si APIM la trata como secreto. La severidad efectiva depende de sus políticas.
- **Recomendación:** no usarla como control de confianza; limitar cuota/orígenes/producto o mover credenciales confidenciales a un BFF.
- **Verificación sugerida:** inspeccionar bundle y políticas APIM, rotar y comprobar límites.
- **Estado de validación:** exposición pública confirmada por diseño; abuso no confirmado.

## FE-004 — Filtros y estadísticas se calculan sobre una sola página

- **Severidad / categoría:** Medium / Calidad funcional.
- **Descripción:** el catálogo obtiene 12 items y luego filtra localmente; “mis publicaciones” calcula conteos/ingresos sobre los items recibidos aunque conserva `totalRecords`.
- **Evidencia:** `home.ts:20-49,60-67`; `my-publications.ts:31-175,185-205`.
- **Impacto:** resultados, categorías, conteos y orden pueden ser incompletos o engañosos cuando hay más páginas.
- **Recomendación:** enviar filtros/orden/página al API o cargar explícitamente todo el conjunto, mostrando el alcance real.
- **Verificación sugerida:** dataset mayor que `pageSize` con coincidencias solo fuera de la primera página.
- **Estado de validación:** confirmado estáticamente.

## FE-005 — La selección de imágenes no se transmite al crear publicación

- **Severidad / categoría:** Medium / Experiencia funcional y datos.
- **Descripción:** se generan Data URLs para preview, pero `CreatePublication` no tiene imágenes y el POST solo envía campos textuales.
- **Evidencia:** `publication-create.ts:243-283,370-400`; `publication-create.model.ts:1-9`.
- **Impacto:** la UI sugiere carga/cobertura de imágenes que no persiste.
- **Recomendación:** marcarla como preview no disponible o diseñar contrato/upload real con validación de tipo/tamaño.
- **Verificación sugerida:** interceptar POST y consultar la publicación creada.
- **Estado de validación:** payload sin imágenes confirmado; respuesta remota no ejecutada.

## FE-006 — El ejemplo de entorno no permite compilar el código actual

- **Severidad / categoría:** Medium / Configuración.
- **Descripción:** `GoogleAuthService` requiere `environment.googleClientId`, ausente en `environment.example.ts`.
- **Evidencia:** `environment.example.ts:1-4`; `google-auth.service.ts:35,48`; workflow genera la tercera propiedad.
- **Impacto:** onboarding reproducible falla al copiar el ejemplo y genera confusión.
- **Recomendación:** mantener una interfaz/esquema único y ejemplo completo sin valores reales.
- **Verificación sugerida:** copiar ejemplo como entorno y ejecutar typecheck/build.
- **Estado de validación:** discrepancia confirmada.

## FE-007 — Panel de perfil sin gestión completa de diálogo accesible

- **Severidad / categoría:** Medium / Accesibilidad.
- **Descripción:** el panel tiene `aside` y backdrop, pero no se observan `role="dialog"`, `aria-modal`, captura/restauración de foco, cierre con Escape o focus trap.
- **Evidencia:** `profile.html:1-14`; `app.ts:39-45`.
- **Impacto:** usuarios de teclado/lector pueden interactuar con contenido detrás o perder contexto.
- **Recomendación:** implementar patrón modal accesible y pruebas de foco/teclado.
- **Verificación sugerida:** prueba manual solo teclado y auditoría axe/NVDA/VoiceOver.
- **Estado de validación:** ausencia estática confirmada; conformidad WCAG completa no evaluada.

## FE-008 — Sin pruebas E2E ni accesibilidad automatizada

- **Severidad / categoría:** Low / Testing.
- **Descripción:** existen 18 suites unitarias, pero no configuración E2E ni axe equivalente.
- **Evidencia:** `angular.json` solo declara `build`, `serve`, `test`; inventario `*.spec.ts`.
- **Impacto:** flujos Google/APIM, navegación real y foco quedan sin cobertura automatizada.
- **Recomendación:** priorizar smoke E2E de login, catálogo, alta y perfil con API controlada.
- **Verificación sugerida:** ejecutar suite en CI con reporte y casos de accesibilidad.
- **Estado de validación:** confirmado por configuración.

## FE-009 — Errores no 401 carecen de contrato y tratamiento uniforme

- **Severidad / categoría:** Low / Manejo de errores.
- **Descripción:** el interceptor solo actúa en 401; vistas alternan entre mensajes genéricos y `error.error.message`, sin timeout/retry/código común.
- **Evidencia:** `api-key.interceptor.ts:30-40`; `profile.ts:358-375`; `home.ts:71-74`.
- **Impacto:** experiencia y diagnóstico inconsistentes ante fallos remotos.
- **Recomendación:** definir sobre de error, política por tipo/status y observabilidad sin datos sensibles.
- **Verificación sugerida:** pruebas de 400, 403, 404, 429, 500 y timeout.
- **Estado de validación:** comportamiento cliente confirmado.

## Verificaciones y límites

`npm run build` y `npm test -- --watch=false` terminaron antes de compilar: Node 24.14.0 no satisface el mínimo de Angular CLI 22.2. No se afirma que las pruebas pasen ni que el bundle cumpla presupuestos.

