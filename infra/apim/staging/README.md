# Staging package (markettec-users-v1, revision 1)

The `staging` inputs target `markettec-users-v1:1` on APIM `markettec-api`. The
`ms-users-google-v1` profile includes Google and Magic Link. The backend route
inventory identifies [ms-users `be4595cfda702848fbd10dd8b2e8b36f126c548c`](https://github.com/a-calderon-org/ms-users-market-tec/commit/be4595cfda702848fbd10dd8b2e8b36f126c548c)
(PR #33). The JWKS snapshot uses kid `stg-jwt-2026-11`.

**Verified against deployment artifacts.** The staged inputs match the deployment
snapshot. Both Magic Link operation policies exported after deployment match the
locally generated candidates after XML canonicalization. This comparison covers
those two exports.

**Review provenance.** The deployment snapshot rebinds the `abuse_protection`
record to the deployed backend and OpenAPI bytes. It carries forward the historical
reference [ms-users PR #32](https://github.com/a-calderon-org/ms-users-market-tec/pull/32).
A separate approval for this binding was not verified. The [prior evidence for
`fc7e18f`](https://github.com/a-calderon-org/market_tec/blob/69e469e9a26b184d94c36ca798422a3d25141fbc/infra/apim/staging/evidence/abuse_protection.staging.json)
remains available in Git history.

From the repository root, verify the SHA-256 values against `openapi_sha256` in
the evidence and `approvals.abuse_protection.evidence_sha256` in the staging manifest.

```bash
shasum -a 256 contracts/openapi/users.json \
  infra/apim/staging/evidence/abuse_protection.staging.json
```

Set `UPSTREAM_GLOBAL_XML` and `UPSTREAM_API_XML` to the saved APIM scope exports
and `OUTPUT_DIR` to a new local directory. Generate the candidate package locally.

```bash
python3 infra/apim/generate_policies.py --mode package --release ms-users-google-v1 \
  --manifest infra/apim/staging/operations.staging.json \
  --openapi contracts/openapi/users.json \
  --backend-routes infra/apim/staging/backend-routes.staging.json \
  --evidence-dir infra/apim/staging/evidence \
  --allowed-origin https://victorious-beach-0a55f0c1e.2.azurestaticapps.net \
  --allowed-origin https://victorious-beach-0a55f0c1e-d04.westus2.2.azurestaticapps.net \
  --jwks infra/apim/staging/jwks/stg-jwt-2026-11.json \
  --issuer https://markettec-api.azure-api.net/users --audience markettec-api --no-product-scope \
  --upstream-global "$UPSTREAM_GLOBAL_XML" --upstream-api "$UPSTREAM_API_XML" \
  --gateway-auth-resource api://9ef55975-8943-4bc4-9e98-21457569d4cc --output-dir "$OUTPUT_DIR"
```
