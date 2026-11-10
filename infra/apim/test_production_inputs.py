"""Production APIM inputs (infra/apim/production): bound to the staging-validated backend and contract, own target,
own JWKS, Google-only release until mail delivery exists. Local checks only."""
import json
import unittest
from pathlib import Path

import generate_policies as gp
from test_password_extension import EXTENSION_BYTES, OPENAPI_BYTES

HERE = Path(__file__).parent
PROD = HERE / "production"
STAGING = HERE / "staging"
MANIFEST = json.loads((PROD / "operations.production.json").read_text())
ROUTES = json.loads((PROD / "backend-routes.production.json").read_text())
CANDIDATE = json.loads((PROD / "review" / "abuse_protection.f56ba7e.production.candidate.json").read_text())


class ProductionInputsTest(unittest.TestCase):
    def test_same_operations_and_routes_as_staging_with_production_target(self):
        staging = json.loads((STAGING / "operations.staging.json").read_text())
        self.assertEqual(staging["operations"], MANIFEST["operations"])
        self.assertEqual(json.loads((STAGING / "backend-routes.staging.json").read_text()), ROUTES)
        self.assertEqual({"environment": "production", "apim_revision": "markettec-users-prod-v1:1"}, MANIFEST["target"])

    def test_jwks_is_the_production_key_not_the_staging_key(self):
        prod = json.loads((PROD / "jwks" / "prod-jwt-2026-11.json").read_text())["keys"]
        stg = json.loads((STAGING / "jwks" / "stg-jwt-2026-11.json").read_text())["keys"]
        self.assertEqual(["prod-jwt-2026-11"], [k["kid"] for k in prod])
        self.assertNotEqual(stg[0]["n"], prod[0]["n"])
        self.assertFalse(any(k in prod[0] for k in ("d", "p", "q", "dp", "dq", "qi")), "public key only")

    def test_candidate_is_bound_to_production_and_not_releasable(self):
        self.assertEqual((CANDIDATE["openapi_contract_version"], CANDIDATE["openapi_sha256"]),
                         gp.contract_binding(OPENAPI_BYTES, EXTENSION_BYTES))
        self.assertEqual((ROUTES["sha"], "production", "markettec-users-prod-v1:1", None),
                         (CANDIDATE["backend_sha"], CANDIDATE["environment"], CANDIDATE["apim_revision"],
                          CANDIDATE["review_id"]))
        self.assertIsNone(MANIFEST["approvals"]["ms_users_contract"])


if __name__ == "__main__":
    unittest.main()
