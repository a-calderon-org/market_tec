# Staging package (markettec-users-v1, revision 1)

The `staging` inputs target `markettec-users-v1:1` on APIM `markettec-api`. The
backend route inventory identifies [ms-users `f56ba7ec43d345cbd152705c53d2a7a8108a5add`](https://github.com/a-calderon-org/ms-users-market-tec/commit/f56ba7ec43d345cbd152705c53d2a7a8108a5add)
(PR #37 merge; includes PR #35 uniform recovery acknowledgement and PR #36 password throttle reset without
`DELETE`): the same 27 routes as `8707f03` (PR #34), i.e.
the 22 routes of `be4595c` plus the five password routes. The manifest
lists the same 27 operations. The JWKS snapshot uses kid `stg-jwt-2026-11`.

**Deployed state (2026-11-10, read-only check).** Azure runs the `ms-users-google-v1`
package built from the previous inputs (backend `be4595c`, 22 operations). Policies
generated from those inputs (Git history before this change) match all 22 operation
exports and the API scope after XML canonicalization. ms-users runs image `be4595c`.

**Staging change 2026-11-11 (market_tec PR #60):** only the `getOwnAuthMethods` operation policy was applied to
`markettec-users-v1` (released by the widened `ms-users-password-v1` profile; `reconciled`, JWT-only). The package
generated from these inputs matched the other 29 operation policies and the API scope after canonicalization. The
staging backend runs `a549864` (tree identical to ms-users `c0bac32`); these inputs stay bound to `f56ba7e`.

**Password activation (`ms-users-password-v1`): approved for staging only, not deployed.** Both approvals are
recorded in `evidence/` and referenced by `operations.staging.json`; each `review_id` is the responsible's real GitHub
review (state `COMMENTED`) on the PR head that carried the candidate, and that head also has an independent `APPROVED`
review. At the time, branch protection on `main` required one independent approval; since 2026-11-10 it requires a PR
and CI but no independent approval (`context/decisions/DECISION_LOG.md`). Not valid for production.

| Approval | Evidence | `review_id` | Independent approval |
|---|---|---|---|
| `abuse_protection` | `evidence/abuse_protection.f56ba7e.staging.json` | `a-calderon-org/market_tec#53/reviews/5846066513` (head `186387a`) | review `5846448643`, SebastianVD32 |
| `ms_users_contract` | `evidence/ms_users_contract.f56ba7e.staging.json` | `a-calderon-org/market_tec#54/reviews/5846068230` (head `cf1585b`) | review `5846443018`, SebastianVD32 |

Accepted scope and residual risks: [`review/abuse_protection.f56ba7e.md`](review/abuse_protection.f56ba7e.md),
[`review/ms_users_contract.f56ba7e.md`](review/ms_users_contract.f56ba7e.md). `evidence/abuse_protection.staging.json`
(bound to `be4595c`, `users.json` only) is kept for history and is no longer referenced.

Binding rules (the generator refuses anything else):

* `abuse_protection`: backend `f56ba7e`, contract binding with the extension (below). Evidence bound
  to `8707f03` is rejected: that build leaked account existence through recovery requests (fixed in PR #35).
  Evidence bound to `75303f4` is rejected: its password throttle ran `DELETE`, which the runtime identity lacks, so
  every successful password login failed in Azure (fixed in PR #36).
  Without it every anonymous operation, including Google and Magic Link, is denied.
* `ms_users_contract`: same binding. Without it the five password operations stay terminal
  503 `BACKEND_CONTRACT_PENDING` (the other ten are unaffected).

Compute the contract binding (version and SHA-256) the evidence must contain:

```bash
python3 -c "import sys; sys.path.insert(0, 'infra/apim'); import generate_policies as g; print(*g.contract_binding(open('contracts/openapi/users.json','rb').read(), open('contracts/openapi/users-password.json','rb').read()))"
```

**Review provenance.** The `be4595c` record carried forward the historical reference
[ms-users PR #32](https://github.com/a-calderon-org/ms-users-market-tec/pull/32); a separate approval for that
binding was not verified. The `f56ba7e` records above have their own reviews.

Set `UPSTREAM_GLOBAL_XML` and `UPSTREAM_API_XML` to fresh APIM scope exports and
`OUTPUT_DIR` to a new local directory. Generate the candidate package locally.

```bash
python3 infra/apim/generate_policies.py --mode package --release ms-users-password-v1 \
  --manifest infra/apim/staging/operations.staging.json \
  --openapi contracts/openapi/users.json \
  --openapi-extension contracts/openapi/users-password.json \
  --backend-routes infra/apim/staging/backend-routes.staging.json \
  --evidence-dir infra/apim/staging/evidence \
  --allowed-origin https://victorious-beach-0a55f0c1e.2.azurestaticapps.net \
  --allowed-origin https://victorious-beach-0a55f0c1e-d04.westus2.2.azurestaticapps.net \
  --jwks infra/apim/staging/jwks/stg-jwt-2026-11.json \
  --issuer https://markettec-api.azure-api.net/users --audience markettec-api --no-product-scope \
  --upstream-global "$UPSTREAM_GLOBAL_XML" --upstream-api "$UPSTREAM_API_XML" \
  --gateway-auth-resource api://9ef55975-8943-4bc4-9e98-21457569d4cc --output-dir "$OUTPUT_DIR"
```

Before applying, compare the ten `ms-users-google-v1` operations and `api-scope.candidate.xml`
with fresh exports: they must be unchanged. Only the five password operations are new.


## Publicaciones de ms-catalog (MTEC-32)

El API `markettec-catalog-stg-v1` usa el sufijo `catalog-stg` en APIM. Registra
solo `GET/POST /v1/publicaciones` y `GET/PUT /v1/publicaciones/{publicationId}`.
Los métodos y los DTO tienen como referencia el
[OpenAPI de Catalog](../../../contracts/openapi/catalog.json). Express valida
los cuerpos y revalida el JWT de cada llamada.

Generar la política con el snapshot público revisado del emisor de staging:

```bash
python infra/apim/staging/build_catalog_policy.py   --jwks infra/apim/staging/jwks/stg-jwt-2026-11.json   --issuer https://markettec-api.azure-api.net/users   --audience markettec-api   --output catalog-stg-policy.xml
```

Crear un valor con nombre secreto `catalog-stg-backend-key` en APIM y
configurar la misma clave base64url de 32 bytes como
`CATALOG_APIM_BACKEND_KEY` en el App Service de staging. La política
valida el JWT del usuario antes de sobrescribir la cabecera interna con esa
clave. El backend exige la clave antes de procesar cualquier ruta. Configurar
el backend HTTPS y aplicar la política del API antes de registrar las
operaciones. Al rotar, actualizar ambos extremos de forma coordinada y comprobar
401 sin JWT en APIM y 403 en el backend directo. La clave se administra en Azure.

El API requiere una suscripción acotada a `markettec-catalog-stg-v1`. La
política limita a 120 solicitudes por minuto por suscripción. Configurar
`MTEC_CATALOG_V2_SUBSCRIPTION_KEY` en la Function del preview d04.
El preview `d04` usa `MTEC_CATALOG_V2_UPSTREAM` con el prefijo HTTPS de APIM.
El build de d04 activa `catalogInternalJwt` y fija `catalogApiBaseUrl` al
prefijo same-origin `/api/catalog-v2/v1`. Los pasos de prueba están en la
[guía de ms-catalog](../../../app/ms-catalog/README.md#validación-en-staging-con-credenciales-reales).
