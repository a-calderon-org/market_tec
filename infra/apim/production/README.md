# Production package (markettec-users-prod-v1, revision 1)

Inputs for the production API `markettec-users-prod-v1` (suffix `users-prod/v1`) on APIM `markettec-api`, backed by
`ca-ms-users-prod` ([ms-users `f56ba7ec43d345cbd152705c53d2a7a8108a5add`](https://github.com/a-calderon-org/ms-users-market-tec/commit/f56ba7ec43d345cbd152705c53d2a7a8108a5add),
the same 27 routes as staging). The JWKS snapshot uses kid `prod-jwt-2026-11` (production key pair; the private key
exists only in Key Vault `kv-mtec-users-prod`). Issuer `https://markettec-api.azure-api.net/users-prod`, audience
`markettec-api`. Allowed origin: `https://victorious-beach-0a55f0c1e.2.azurestaticapps.net` only.

**Rebound to ms-users `c0bac32` (PR #38 merge; same 27 routes, same contract binding; tree identical to the image
validated in staging).** Target release: `ms-users-password-v1`. **Both approvals are pending:** the `f56ba7e`
`abuse_protection` record (`evidence/abuse_protection.f56ba7e.production.json`, review `#57/reviews/5849713398`) is
kept as history and does not cover `c0bac32`, so `approvals` are both `null` and a package generated now denies every
anonymous and password operation. Case file and candidates: [`review/ms_users_c0bac32.production.md`](review/ms_users_c0bac32.production.md).
The deployed APIM (`ms-users-google-v1` for `f56ba7e`) is unchanged until the evidence is registered.

**Shared runtime (decision 2026-11-10).** The subscription allows a single Container Apps environment, so
`ca-ms-users-prod` runs in `cae-ms-users-stg2` next to `ca-ms-users-stg`. Identities, databases, Key Vaults, JWT/CSRF
keys and settings are separate; the environment and its log destination (`log-ms-users-stg`) are shared.

```bash
python3 infra/apim/generate_policies.py --mode package --release ms-users-password-v1 \
  --manifest infra/apim/production/operations.production.json \
  --openapi contracts/openapi/users.json --openapi-extension contracts/openapi/users-password.json \
  --backend-routes infra/apim/production/backend-routes.production.json \
  --evidence-dir infra/apim/production/evidence \
  --allowed-origin https://victorious-beach-0a55f0c1e.2.azurestaticapps.net \
  --jwks infra/apim/production/jwks/prod-jwt-2026-11.json \
  --issuer https://markettec-api.azure-api.net/users-prod --audience markettec-api --no-product-scope \
  --upstream-global "$UPSTREAM_GLOBAL_XML" --upstream-api "$UPSTREAM_API_XML" \
  --gateway-auth-resource api://44f7943d-e2b2-410d-a625-de5e40f26f01 --output-dir "$OUTPUT_DIR"
```
