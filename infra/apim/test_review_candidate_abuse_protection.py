"""Review candidate staging/review/abuse_protection.f56ba7e.* (Proposed, not releasable).

Proves the candidate is bound to the staging inputs and can never act as evidence: it is not an approval and does
not replace a reviewed `review_id`. The PR that later records real evidence must delete or update this test.
"""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import generate_policies as gp
from test_password_extension import (EXTENSION_BYTES, MANIFEST, OPENAPI_BYTES, ROUTES, approved_case, defs, package,
                                     unapproved)

HERE = Path(__file__).parent
REVIEW = HERE / "staging" / "review"
CANDIDATE_PATH = REVIEW / "abuse_protection.f56ba7e.candidate.json"
CANDIDATE = json.loads(CANDIDATE_PATH.read_text())
BACKEND = "f56ba7ec43d345cbd152705c53d2a7a8108a5add"
VERSION = "0.3.0-draft+users-password-0.1.0-draft"
DIGEST = "4b57f6460a42b6c47ecae725da83a79442e8b889c5078fdfa9db755420eb8950"
GOOGLE_AND_MAGIC_LINK = {"createAuthenticationAttempt", "exchangeGoogleCredential",
                         "legacyGoogleRegistrationCompatibility", "requestInstitutionalEmailLink",
                         "confirmInstitutionalEmailLink"}
PASSWORD_ANONYMOUS = {"loginWithPassword", "requestPasswordRecoveryLink"}


class CandidateBindingTest(unittest.TestCase):
    def test_bound_to_staging_backend_contract_and_revision(self):
        self.assertEqual(BACKEND, ROUTES["sha"])
        self.assertEqual((VERSION, DIGEST), gp.contract_binding(OPENAPI_BYTES, EXTENSION_BYTES))
        self.assertEqual({"approval_type": "abuse_protection", "backend_sha": BACKEND,
                          "openapi_contract_version": VERSION, "openapi_sha256": DIGEST, "environment": "staging",
                          "apim_revision": "markettec-users-v1:1"},
                         {k: CANDIDATE[k] for k in gp.EVIDENCE_FIELDS - {"review_id"}})
        self.assertEqual(MANIFEST["target"], {"environment": "staging", "apim_revision": "markettec-users-v1:1"})

    def test_scope_is_staging_only_and_the_review_is_pending(self):
        self.assertEqual("candidate_not_releasable", CANDIDATE["status"])
        self.assertEqual("staging_only_not_production", CANDIDATE["acceptance_scope"])
        self.assertEqual("ms-users-password-v1", CANDIDATE["release_profile"])
        self.assertIsNone(CANDIDATE["review_id"])

    def test_dossier_states_the_same_binding(self):
        text = (REVIEW / "abuse_protection.f56ba7e.md").read_text()
        for value in (BACKEND, VERSION, DIGEST, "markettec-users-v1:1", "Proposed"):
            self.assertIn(value, text)


class CandidateIsNotEvidenceTest(unittest.TestCase):
    def test_manifest_does_not_reference_the_candidate(self):
        files = {v["evidence_file"] for v in MANIFEST["approvals"].values() if v}
        self.assertNotIn(CANDIDATE_PATH.name, files)
        self.assertFalse((HERE / "staging" / "evidence" / CANDIDATE_PATH.name).exists())

    def test_verifier_rejects_the_candidate_even_when_referenced(self):
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(directory, ignore_errors=True))
        data = CANDIDATE_PATH.read_bytes()
        (directory / CANDIDATE_PATH.name).write_bytes(data)
        manifest = unapproved()
        manifest["approvals"]["abuse_protection"] = {"evidence_file": CANDIDATE_PATH.name,
                                                     "evidence_sha256": gp.hashlib.sha256(data).hexdigest()}
        with self.assertRaisesRegex(ValueError, "evidence needs exactly"):
            package(manifest, directory)


class ApprovalScopeTest(unittest.TestCase):
    """What a real abuse_protection approval would release: Google and Magic Link too, not only password."""

    def test_unapproved_denies_google_magic_link_and_password(self):
        d = defs(package(unapproved()))
        for op_id in GOOGLE_AND_MAGIC_LINK | PASSWORD_ANONYMOUS:
            self.assertEqual(["abuse_protection_unapproved"], d[op_id]["blocked_reasons"], op_id)

    def test_approval_alone_enables_google_and_magic_link_but_not_password(self):
        manifest, directory = approved_case(self, names=("abuse_protection",))
        d = defs(package(manifest, directory))
        for op_id in GOOGLE_AND_MAGIC_LINK:
            self.assertEqual("enabled", d[op_id]["status"], op_id)
        for op_id in PASSWORD_ANONYMOUS:
            self.assertEqual(["ms_users_contract_unreconciled"], d[op_id]["blocked_reasons"], op_id)

    def test_anonymous_admission_set_is_exactly_the_seven_documented_operations(self):
        anonymous = {op["id"] for op in MANIFEST["operations"] if op["anonymous_admission"]}
        self.assertEqual(GOOGLE_AND_MAGIC_LINK | PASSWORD_ANONYMOUS, anonymous)


if __name__ == "__main__":
    unittest.main()
