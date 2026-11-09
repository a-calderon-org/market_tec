# Staging package (markettec-users-v1, revision 1)

Applied to APIM `markettec-api` on 2026-11-09. The committed base manifest stays without approvals; this
directory holds the staging-only inputs: target `staging` / `markettec-users-v1:1`, `abuse_protection` evidence
(owner-approved, bound to ms-users `fc7e18f`, PR a-calderon-org/ms-users-market-tec#32), and the public JWKS
snapshot of ms-users kid `stg-jwt-2026-11`.

```bash
python3 infra/apim/generate_policies.py --mode package --release ms-users-google-v1 \
  --manifest infra/apim/staging/operations.staging.json \
  --backend-routes infra/apim/staging/backend-routes.staging.json \
  --evidence-dir infra/apim/staging/evidence \
  --allowed-origin https://victorious-beach-0a55f0c1e.2.azurestaticapps.net \
  --allowed-origin https://victorious-beach-0a55f0c1e-d04.westus2.2.azurestaticapps.net \
  --jwks infra/apim/staging/jwks/stg-jwt-2026-11.json \
  --issuer https://markettec-api.azure-api.net/users --audience markettec-api --no-product-scope \
  --upstream-global <export global> --upstream-api <export API> \
  --gateway-auth-resource api://9ef55975-8943-4bc4-9e98-21457569d4cc --output-dir <new dir>
```
