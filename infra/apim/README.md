# APIM policies as code (MTEC-12)

`operations.json` is editable data. `security_reference.py` is the reviewed security
reference: the generator rejects any manifest whose auth class, cookies, Origin, CSRF,
admission or contract status differ from it. Approvals in the manifest only count when
their `evidence_sha256` was added to `APPROVED_EVIDENCE` by code review (empty today).

Modes (`generate_policies.py --mode`):

* `analyze` writes `*.xml.txt` and `operations.analysis.json`; never publishable.
* `package` writes `*.xml` and `operations.generated.json`, and refuses unless all of the
  following exist.

## Exports still required before a package can be built

| Input | What to export |
| --- | --- |
| `--upstream-global` | service-wide policy XML |
| `--upstream-product` | policy XML of the product(s) containing the users API |
| `--upstream-api` | policy XML at the users API scope |
| `--jwks`, `--issuer`, `--audience` | reviewed public JWKS snapshot and exact issuer/audience |

Exports must contain only known elements, no JWT/Google validation, no `include-fragment`,
and one `<base />` per section at product and API scope (none at global scope).
APIM named value `allowed-origins` (comma-separated exact origins) must exist at deploy time.
Blocked operations are terminal 503 denials with no `<base />` and no backend section.
APIM Consumption has no `rate-limit-by-key`; admission abuse protection is an external requirement.
