"""Production APIM inputs (infra/apim/production): bound to the staging-validated backend (ms-users c0bac32) and
contract, own target, own JWKS. Both approvals for c0bac32 are candidates until the responsible's review; the
f56ba7e approval is kept as history and does not cover the new backend. Local checks only."""
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
CANDIDATES = {name: json.loads((PROD / "review" / f"{name}.c0bac32.production.candidate.json").read_text())
              for name in ("abuse_protection", "ms_users_contract")}


class ProductionInputsTest(unittest.TestCase):
    def test_same_operations_and_routes_as_staging_with_production_target(self):
        staging = json.loads((STAGING / "operations.staging.json").read_text())
        self.assertEqual(staging["operations"], MANIFEST["operations"])
        # Same route inventory as staging; only the bound commit differs (controllers unchanged since f56ba7e).
        self.assertEqual(json.loads((STAGING / "backend-routes.staging.json").read_text())["routes"], ROUTES["routes"])
        self.assertEqual("c0bac32b9b48874dfb96d4efe2465a10caaa1591", ROUTES["sha"])
        self.assertEqual({"environment": "production", "apim_revision": "markettec-users-prod-v1:1"}, MANIFEST["target"])

    def test_jwks_is_the_production_key_not_the_staging_key(self):
        prod = json.loads((PROD / "jwks" / "prod-jwt-2026-11.json").read_text())["keys"]
        stg = json.loads((STAGING / "jwks" / "stg-jwt-2026-11.json").read_text())["keys"]
        self.assertEqual(["prod-jwt-2026-11"], [k["kid"] for k in prod])
        self.assertNotEqual(stg[0]["n"], prod[0]["n"])
        self.assertFalse(any(k in prod[0] for k in ("d", "p", "q", "dp", "dq", "qi")), "public key only")

    def test_candidates_are_bound_to_production_and_not_releasable(self):
        for name, candidate in CANDIDATES.items():
            self.assertEqual(name, candidate["approval_type"])
            self.assertEqual("candidate_not_releasable", candidate["status"])
            self.assertEqual("ms-users-password-v1", candidate["release_profile"])
            self.assertEqual((candidate["openapi_contract_version"], candidate["openapi_sha256"]),
                             gp.contract_binding(OPENAPI_BYTES, EXTENSION_BYTES))
            self.assertEqual((ROUTES["sha"], "production", "markettec-users-prod-v1:1", None),
                             (candidate["backend_sha"], candidate["environment"], candidate["apim_revision"],
                              candidate["review_id"]))
        self.assertEqual({"abuse_protection": None, "ms_users_contract": None}, MANIFEST["approvals"])
        _, approvals = gp._prepare(MANIFEST, OPENAPI_BYTES, ROUTES, PROD / "evidence", EXTENSION_BYTES)
        self.assertEqual({"abuse_protection": False, "ms_users_contract": False}, approvals)

    def test_f56ba7e_production_evidence_does_not_cover_the_new_backend(self):
        doc = json.loads((PROD / "evidence" / "abuse_protection.f56ba7e.production.json").read_text())
        self.assertEqual("a-calderon-org/market_tec#57/reviews/5849713398", doc["review_id"])
        manifest = json.loads(json.dumps(MANIFEST))
        manifest["approvals"]["abuse_protection"] = {
            "evidence_file": "abuse_protection.f56ba7e.production.json",
            "evidence_sha256": gp.hashlib.sha256((PROD / "evidence" / "abuse_protection.f56ba7e.production.json")
                                                 .read_bytes()).hexdigest()}
        with self.assertRaisesRegex(ValueError, "another ms-users backend"):
            gp._prepare(manifest, OPENAPI_BYTES, ROUTES, PROD / "evidence", EXTENSION_BYTES)


if __name__ == "__main__":
    unittest.main()
