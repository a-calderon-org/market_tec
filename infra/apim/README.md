# APIM policies as code (MTEC-12)

Policies are validated by Azure only where the handoff (§11) records it; nothing here is approved for production.

`operations.json` is editable data. `security_reference.py` is the reviewed security reference:
the generator rejects any manifest whose auth class, cookies, Origin, CSRF, admission or contract
status differ from it.

## Outputs (`generate_policies.py --mode`, into a new or empty `--output-dir`)

| Mode | Files | Meaning |
| --- | --- | --- |
| `analyze` | `<id>.xml.txt`, `operations.analysis.json` | local review only |
| `package` | `<id>.candidate.xml`, `operations.candidate.json` | candidate: passed **local** structural checks (`policy_schema.py`); `azure_validated` and `deployment_approved` stay `false` |

Runs write to a staging directory and rename it, so a failure leaves nothing and an old output
directory is never reused or mixed. `package` refuses unless all three scope exports pass the local
check and JWKS, issuer and audience are given.

## Release profile `ms-users-google-v1` (MTEC-12/MTEC-41)

`--release ms-users-google-v1 --allowed-origin https://<spa-origin>` (repeatable) narrows the surface to the eight
Google-flow operations in `release_profiles.py` (reviewed code). Every other operation becomes a terminal 404
`OPERATION_NOT_RELEASED`; released operations still need their approvals (intent/login/registration stay closed
without `abuse_protection`). It also writes a candidate keyless API definition (`api-definition.*.json`,
`subscriptionRequired=false`, separate from `markettec-api-v1`), an API-scope CORS policy with explicit origins
(`api-scope.*`) and the resolved Angular → APIM → ms-users chain (`route_check.py`). Nothing is applied to Azure.
Operator steps: [`docs/MTEC12_41_MS_USERS_STAGING_HANDOFF.md`](../../docs/MTEC12_41_MS_USERS_STAGING_HANDOFF.md).

## Password extension and profile `ms-users-password-v1` (Proposed)

`--openapi-extension contracts/openapi/users-password.json` adds the five password operations of ms-users
`8707f03` (PR #34) to `users.json` without changing it. Their security rows live in `PASSWORD_SECURITY_REFERENCE`
(`security_reference.py`); the 22-row `SECURITY_REFERENCE`, its digest, `operations.json` and the B07 matrix are
unchanged. The generator accepts the extension only if it declares `x-extends` `users.json` with the same version,
adds exactly those five routes and overlaps none of the base paths.

| Operation | Class | Gateway checks |
| --- | --- | --- |
| `POST /auth/password/login`, `POST /auth/password/recovery/requests` | public, anonymous admission | Origin; needs `abuse_protection` |
| `GET /me/password` | jwt | `validate-jwt` |
| `POST`/`PUT /me/password` | jwt, `csrf: session` | Origin, `X-CSRF-Token` presence/format, `validate-jwt` |

`csrf: session` is valid only for cookieless internal-JWT writes: ms-users binds the token to the JWT's session
(`SessionAuthority.requireCsrf`), so the gateway checks only presence and format. All five rows are
`pending_password_contract` and stay terminal 503 `BACKEND_CONTRACT_PENDING` until an `ms_users_contract` evidence
document exists. With the extension, evidence binds to both files: `openapi_contract_version` =
`<users.json version>+users-password-<extension version>` and `openapi_sha256` = SHA-256 of
`"<users.json sha256>\n<users-password.json sha256>\n"` (`contract_binding()`); evidence bound to `users.json` alone is
rejected. The profile `ms-users-password-v1` = `ms-users-google-v1` + the five operations (same API, CORS headers
and methods). The SPA does not call `PUT /me/password` yet; the route is still checked end to end by `route_check.py`.

Gateway authentication (MTEC-12/D04): `--gateway-auth-resource api://<app id>` ends every forwarded operation with
`authentication-managed-identity` for that resource (Container Apps authentication in front of ms-users). Because that
replaces `Authorization`, internal-JWT operations first copy the validated user JWT to `X-MTEC-User-Authorization`
(ms-users `GatewayUserTokenFilter`); other operations delete any client copy. Terminal denials fetch no token.
Staging resources and tests: handoff §12.

Partial staging package (`--mode package --release …` only): `--jwt-unconfigured` denies every internal-JWT
operation (503 `INTERNAL_JWT_UNCONFIGURED`) instead of requiring `--jwks/--issuer/--audience`, and
`--no-product-scope` replaces the product export when Azure shows the API is in no product. Neither enables an
operation; both are recorded in `operations.candidate.json`. Staging deployment of 2026-11-09: handoff §11.

## Approvals

`approvals.*` in the manifest point to a JSON document in `infra/apim/evidence/` and its SHA-256. The
document must contain exactly `approval_type`, `backend_sha`, `openapi_contract_version`, `openapi_sha256`,
`environment`, `apim_revision`, `review_id`, and match: the approval type, `backend-routes.json` sha,
OpenAPI `info.version`, the SHA-256 of the exact OpenAPI file bytes used to generate, and the manifest `target`.
A well-formed `review_id` is not a review by itself. Anything else raises. The tool cannot prove who
wrote a document: `review_id` must name a real GitHub review by the project responsible on the PR head that
carried the candidate, and branch protection on `main` (PR required, admins included; no independent approval
since 2026-11-10, see `context/decisions/DECISION_LOG.md`) keeps evidence changes in reviewed PRs. Neither is
checked here. Without such a review keep the approval `null`.

## Exports and evidence still required (outside this repo)

* Exported policy XML for global, every product that contains the users API, and the API scope
  (`--upstream-global|product|api`). Inherited scopes may hold only literal content: `base`, `cors`
  (literal https `host[:port]` origins, ports 1-65535, no credentials/paths/named values, no `*` with
  credentials) and `forward-request` (global backend only). `set-header` is rejected in every inherited
  section: a header write or delete there could remove `Cache-Control: no-store` from authenticated
  responses or weaken HSTS, X-Frame-Options or X-Content-Type-Options, and a name allowlist cannot prove a
  given action/value safe. Also rejected: expressions, named values, `trace`, `choose`, `return-response`,
  `set-variable`, and control characters in any decoded value. **Operator review:** an export that uses any
  of these is refused with an explanation; header policies must be moved to a reviewed operation-level
  policy or evaluated as the effective policy in Azure before they can be considered.
* Operation-level policies currently on the API, effective-policy review, gateway compile/request
  tests of every expression on the target tier (Consumption), and operator deployment approval.
* Named value `allowed-origins`; reviewed JWKS, issuer, audience; `target` environment/APIM revision.
* Abuse protection that works on Consumption (`rate-limit-by-key` is unavailable there) and B07
  contract-reconciliation evidence.
