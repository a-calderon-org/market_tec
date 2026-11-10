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

**Proposed: password activation (`ms-users-password-v1`). Not approved, not deployed.**
The existing `abuse_protection` evidence is bound to `be4595c` and to `users.json`
alone, so generation with these inputs is **refused** until the operator records, after
explicit authorization, new evidence documents in `evidence/`:

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

**Review provenance.** The previous deployment snapshot rebound the `abuse_protection`
record to the deployed backend and OpenAPI bytes, carrying forward the historical
reference [ms-users PR #32](https://github.com/a-calderon-org/ms-users-market-tec/pull/32);
a separate approval for that binding was not verified. A new binding needs its own
reviewed `review_id`; reusing PR #32 does not cover the password operations.

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
