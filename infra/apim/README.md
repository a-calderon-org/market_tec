# APIM policies as code (MTEC-12)

Nothing here is validated by Azure, imported, or approved for deployment.

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

## Approvals

`approvals.*` in the manifest point to a JSON document in `infra/apim/evidence/` and its SHA-256. The
document must contain exactly `approval_type`, `backend_sha`, `openapi_contract_version`,
`environment`, `apim_revision`, `review_id`, and match: the approval type, `backend-routes.json` sha,
OpenAPI `info.version` and the manifest `target`. Anything else raises. The tool cannot prove who
wrote a document: that needs GitHub required review / branch protection on `infra/apim/**` and an
operator, which are **not** configured or checked here. Until then keep every approval `null`.

## Exports and evidence still required (outside this repo)

* Exported policy XML for global, every product that contains the users API, and the API scope
  (`--upstream-global|product|api`). Inherited scopes may hold only `base`, `cors`, `trace` and
  non-protected `set-header`; `forward-request` only in global backend. Anything that could alter
  `Authorization`/cookies/identity or end the request early is rejected because its effect needs the
  effective policy evaluated in Azure.
* Operation-level policies currently on the API, effective-policy review, gateway compile/request
  tests of every expression on the target tier (Consumption), and operator deployment approval.
* Named value `allowed-origins`; reviewed JWKS, issuer, audience; `target` environment/APIM revision.
* Abuse protection that works on Consumption (`rate-limit-by-key` is unavailable there) and B07
  contract-reconciliation evidence.
