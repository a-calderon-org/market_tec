"""Review candidate staging/review/ms_users_contract.f56ba7e.* (Proposed, not releasable).

Pins the reconciliation of the five password operations across manifest, security reference, contract, backend
routes and client calls, and proves the candidate can never act as evidence. Real evidence is recorded in
staging/evidence (RegisteredEvidenceTest).
"""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import generate_policies as gp
from release_profiles import NOT_RELEASED
from route_check import PASSWORD_CALLS
from security_reference import PASSWORD_SECURITY_REFERENCE
from test_password_extension import (EXTENSION_BYTES, MANIFEST, OPENAPI_BYTES, PASSWORD_OPS, ROUTES, approved_case,
                                     defs, package, unapproved)

HERE = Path(__file__).parent
REVIEW = HERE / "staging" / "review"
CANDIDATE_PATH = REVIEW / "ms_users_contract.f56ba7e.candidate.json"
CANDIDATE = json.loads(CANDIDATE_PATH.read_text())
EXTENSION = json.loads(EXTENSION_BYTES)
BACKEND = "f56ba7ec43d345cbd152705c53d2a7a8108a5add"
VERSION = "0.3.0-draft+users-password-0.1.0-draft"
DIGEST = "4b57f6460a42b6c47ecae725da83a79442e8b889c5078fdfa9db755420eb8950"
PR23 = {"createMethodProofAttempt", "verifyGoogleMethodProof", "requestEmailMethodProof", "verifyEmailMethodProof",
        "linkOwnAuthMethod"}
SUCCESS = {"loginWithPassword": "200", "requestPasswordRecoveryLink": "202", "getOwnPasswordStatus": "200",
           "setOwnInitialPassword": "201", "changeOwnPassword": "200"}


def _contract_ops():
    return {o["operationId"]: (m.upper(), p, o) for p, item in EXTENSION["paths"].items()
            for m, o in item.items() if m in ("get", "post", "put")}


def _params(o):
    return {x["$ref"].rsplit("/", 1)[-1] for x in o.get("parameters", [])}


class CandidateTest(unittest.TestCase):
    def test_bound_to_staging_backend_contract_and_revision(self):
        self.assertEqual(BACKEND, ROUTES["sha"])
        self.assertEqual((VERSION, DIGEST), gp.contract_binding(OPENAPI_BYTES, EXTENSION_BYTES))
        self.assertEqual({"approval_type": "ms_users_contract", "backend_sha": BACKEND,
                          "openapi_contract_version": VERSION, "openapi_sha256": DIGEST, "environment": "staging",
                          "apim_revision": "markettec-users-v1:1"},
                         {k: CANDIDATE[k] for k in gp.EVIDENCE_FIELDS - {"review_id"}})
        self.assertEqual(PASSWORD_OPS, set(CANDIDATE["operations"]))
        self.assertEqual(("candidate_not_releasable", "staging_only_not_production", "ms-users-password-v1", None),
                         (CANDIDATE["status"], CANDIDATE["acceptance_scope"], CANDIDATE["release_profile"],
                          CANDIDATE["review_id"]))

    def test_dossier_states_the_same_binding(self):
        text = (REVIEW / "ms_users_contract.f56ba7e.md").read_text()
        for value in (BACKEND, VERSION, DIGEST, "markettec-users-v1:1", "Proposed", *PASSWORD_OPS):
            self.assertIn(value, text)

    def test_manifest_does_not_reference_the_candidate(self):
        self.assertNotEqual(CANDIDATE_PATH.name, MANIFEST["approvals"]["ms_users_contract"]["evidence_file"])
        self.assertFalse((HERE / "staging" / "evidence" / CANDIDATE_PATH.name).exists())

    def test_verifier_rejects_the_candidate_even_when_referenced(self):
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(directory, ignore_errors=True))
        data = CANDIDATE_PATH.read_bytes()
        (directory / CANDIDATE_PATH.name).write_bytes(data)
        manifest = unapproved()
        manifest["approvals"]["ms_users_contract"] = {"evidence_file": CANDIDATE_PATH.name,
                                                      "evidence_sha256": gp.hashlib.sha256(data).hexdigest()}
        with self.assertRaisesRegex(ValueError, "evidence needs exactly"):
            package(manifest, directory)


class ReconciliationTest(unittest.TestCase):
    def test_five_operations_agree_across_every_source(self):
        rows = {op["id"]: op for op in MANIFEST["operations"] if op["id"] in PASSWORD_OPS}
        contract = _contract_ops()
        routes = {tuple(r) for r in ROUTES["routes"]}
        self.assertEqual(PASSWORD_OPS, set(rows))
        self.assertEqual(PASSWORD_OPS, set(contract))
        for op_id, op in rows.items():
            method, path, spec = contract[op_id]
            self.assertEqual((op["method"], op["public_path"], op["backend_path"]), PASSWORD_CALLS[op_id], op_id)
            self.assertEqual((op["method"], op["backend_path"]), (method, path), op_id)
            self.assertIn((method, path), routes, op_id)
            reference = PASSWORD_SECURITY_REFERENCE[(method, path)]
            self.assertEqual(reference, {k: op[k] for k in gp.REFERENCE_FIELDS}, op_id)
            self.assertEqual("pending_password_contract", op["contract_status"], op_id)
            bearer = any("bearerAuth" in s for s in spec["security"])
            self.assertEqual(op["auth"] == "jwt", bearer, op_id)
            self.assertEqual(op["origin"], "Origin" in _params(spec), op_id)
            self.assertEqual(op["csrf"] == "session", "CsrfToken" in _params(spec), op_id)
            self.assertIn(SUCCESS[op_id], spec["responses"], op_id)

    def test_unapproved_contract_keeps_the_five_operations_pending(self):
        manifest, directory = approved_case(self, names=("abuse_protection",))
        d = defs(package(manifest, directory))
        for op_id in PASSWORD_OPS:
            self.assertEqual(["ms_users_contract_unreconciled"], d[op_id]["blocked_reasons"], op_id)

    def test_both_approvals_enable_the_five_with_the_reviewed_gates(self):
        manifest, directory = approved_case(self)
        result = package(manifest, directory)
        d = defs(result)
        for op_id in PASSWORD_OPS:
            self.assertEqual("enabled", d[op_id]["status"], op_id)
            xml = result["policies"][op_id]
            jwt = next(op for op in MANIFEST["operations"] if op["id"] == op_id)["auth"] == "jwt"
            self.assertEqual(jwt, "validate-jwt" in xml, op_id)
            self.assertIn(gp.USER_TOKEN_HEADER, xml, op_id)


class ApprovalScopeTest(unittest.TestCase):
    """H1: the ms_users_contract flag is not scoped by contract_status; only the release profile narrows it."""

    def test_flag_alone_would_lift_pr23_operations(self):
        approvals = {"abuse_protection": True, "ms_users_contract": True}
        for op in MANIFEST["operations"]:
            if op["id"] in PR23:
                self.assertEqual("pending_ms_users_pr23", op["contract_status"])
                self.assertIsNone(gp.blocked_reason(op, approvals), op["id"])

    def test_release_profile_keeps_pr23_operations_not_released(self):
        manifest, directory = approved_case(self)
        d = defs(package(manifest, directory))
        for op_id in PR23:
            self.assertEqual("blocked", d[op_id]["status"], op_id)
            self.assertEqual(["not_in_release_profile"], d[op_id]["blocked_reasons"], op_id)
        self.assertEqual("OPERATION_NOT_RELEASED", NOT_RELEASED[2])


class RegisteredEvidenceTest(unittest.TestCase):
    """The recorded evidence: the candidate's binding plus the responsible's real GitHub review (state COMMENTED,
    on the PR head it names). The independent technical approval of that head is a separate review."""
    REVIEW_ID = "a-calderon-org/market_tec#54/reviews/5846068230"

    def test_evidence_is_the_candidate_binding_with_the_recorded_review(self):
        claim = MANIFEST["approvals"]["ms_users_contract"]
        path = HERE / "staging" / "evidence" / claim["evidence_file"]
        data = path.read_bytes()
        self.assertEqual(claim["evidence_sha256"], gp.hashlib.sha256(data).hexdigest())
        doc = json.loads(data)
        self.assertEqual(gp.EVIDENCE_FIELDS, set(doc))
        self.assertEqual({k: CANDIDATE[k] for k in gp.EVIDENCE_FIELDS - {"review_id"}},
                         {k: doc[k] for k in gp.EVIDENCE_FIELDS - {"review_id"}})
        self.assertEqual(self.REVIEW_ID, doc["review_id"])

    def test_generator_accepts_the_staging_evidence(self):
        _, approvals = gp._prepare(MANIFEST, OPENAPI_BYTES, ROUTES, HERE / "staging" / "evidence", EXTENSION_BYTES)
        self.assertTrue(approvals["ms_users_contract"])


if __name__ == "__main__":
    unittest.main()
