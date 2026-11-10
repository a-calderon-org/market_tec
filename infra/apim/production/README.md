# Production package (markettec-users-prod-v1, revision 1)

Inputs for the production API `markettec-users-prod-v1` (suffix `users-prod/v1`) on APIM `markettec-api`, backed by
`ca-ms-users-prod` ([ms-users `f56ba7ec43d345cbd152705c53d2a7a8108a5add`](https://github.com/a-calderon-org/ms-users-market-tec/commit/f56ba7ec43d345cbd152705c53d2a7a8108a5add),
the same 27 routes as staging). The JWKS snapshot uses kid `prod-jwt-2026-11` (production key pair; the private key
exists only in Key Vault `kv-mtec-users-prod`). Issuer `https://markettec-api.azure-api.net/users-prod`, audience
`markettec-api`. Allowed origin: `https://victorious-beach-0a55f0c1e.2.azurestaticapps.net` only.

**Release profile: `ms-users-google-v1`.** Google login/registration, session, refresh, logout, own profile and the
Magic Link routes. The five password operations stay `404 OPERATION_NOT_RELEASED`. In ms-users,
`USERS_EMAIL_ENABLED` and `USERS_PASSWORD_ENABLED` stay `false` until mail reaches recipients other than the mail
provider account owner (the current sender `onboarding@resend.dev` is a provider test sender).

**Approvals.** Production evidence is separate from staging: environment `production`, revision
`markettec-users-prod-v1:1`. `abuse_protection` needs the responsible's GitHub review accepting R1–R4 of
[`../staging/review/abuse_protection.f56ba7e.md`](../staging/review/abuse_protection.f56ba7e.md) for production.
Until it is recorded every anonymous operation is denied (`503 ADMISSION_DISABLED`). `ms_users_contract` is not needed
for this profile and stays `null`.

**Shared runtime (decision 2026-11-10).** The subscription allows a single Container Apps environment, so
`ca-ms-users-prod` runs in `cae-ms-users-stg2` next to `ca-ms-users-stg`. Identities, databases, Key Vaults, JWT/CSRF
keys and settings are separate; the environment and its log destination (`log-ms-users-stg`) are shared.

```bash
python3 infra/apim/generate_policies.py --mode package --release ms-users-google-v1 \
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
