"""Password extension (contracts/openapi/users-password.json, ms-users 8707f03) and profile ms-users-password-v1.

Local checks only: they prove the staging inputs are consistent and fail closed without approvals; they do not
approve the extension, validate anything in Azure or record B07 conformity.
"""
import copy
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

import generate_policies as gp
from release_profiles import RELEASE_PROFILES
from route_check import PASSWORD_CALLS, expected_calls
from security_reference import PASSWORD_SECURITY_REFERENCE, SECURITY_REFERENCE, reference_digest
from test_generate_policies import AUD, ISS, JWKS, OPENAPI_BYTES, UPSTREAM, simulate

HERE = Path(__file__).parent
STAGING = HERE / "staging"
MANIFEST = json.loads((STAGING / "operations.staging.json").read_text())
ROUTES = json.loads((STAGING / "backend-routes.staging.json").read_text())
EXTENSION_BYTES = (HERE / "../../contracts/openapi/users-password.json").read_bytes()
PROFILE = "ms-users-password-v1"
ORIGINS = ["https://app.example.com"]
RESOURCE = "api://9ef55975-8943-4bc4-9e98-21457569d4cc"  # staging Container Apps authentication (handoff §12)
PASSWORD_OPS = {"loginWithPassword", "requestPasswordRecoveryLink", "getOwnPasswordStatus", "setOwnInitialPassword",
                "changeOwnPassword"}
ANONYMOUS = {"loginWithPassword", "requestPasswordRecoveryLink"}
SESSION_CSRF = {"setOwnInitialPassword", "changeOwnPassword"}


def unapproved(manifest=MANIFEST):
    m = copy.deepcopy(manifest)
    m["approvals"] = {"abuse_protection": None, "ms_users_contract": None}
    return m


def approved_case(testcase, names=("abuse_protection", "ms_users_contract"), binding=None):
    """Evidence bound to 8707f03 and to both contract files, in a temp dir (never in the repository)."""
    version, digest = binding or gp.contract_binding(OPENAPI_BYTES, EXTENSION_BYTES)
    directory = Path(tempfile.mkdtemp())
    testcase.addCleanup(lambda: shutil.rmtree(directory, ignore_errors=True))
    manifest = unapproved()
    for name in names:
        data = json.dumps({"approval_type": name, "backend_sha": ROUTES["sha"], "openapi_contract_version": version,
                           "openapi_sha256": digest, "environment": "staging",
                           "apim_revision": "markettec-users-v1:1", "review_id": f"review/{name}-test"}).encode()
        (directory / f"{name}.json").write_bytes(data)
        manifest["approvals"][name] = {"evidence_file": f"{name}.json", "evidence_sha256": hashlib.sha256(data).hexdigest()}
    return manifest, directory


def package(manifest, directory=None, profile=PROFILE, extension=EXTENSION_BYTES):
    return gp.build_package(manifest, JWKS, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES, directory, profile, ORIGINS,
                            gateway_resource=RESOURCE, openapi_extension=extension)


def defs(result):
    return {d["id"]: d for d in result["definitions"]}


class InventoryTest(unittest.TestCase):
    def test_staging_inventory_is_8707f03_with_27_routes(self):
        self.assertEqual("8707f03cf61c1e0bbe042a24ae6a2d721609e6f7", ROUTES["sha"])
        self.assertEqual(27, len(ROUTES["routes"]))
        self.assertEqual(27, len(MANIFEST["operations"]))
        password = {(o["method"], o["backend_path"]) for o in MANIFEST["operations"] if o["id"] in PASSWORD_OPS}
        self.assertEqual(set(PASSWORD_SECURITY_REFERENCE), password)

    def test_base_reference_and_generic_manifest_unchanged(self):
        self.assertEqual(22, len(SECURITY_REFERENCE))
        self.assertEqual("ed55ae7808b49e21890f36ba9f4db28b08a6498c5f43cd48afa72ac10151840f", reference_digest())
        self.assertEqual(22, len(json.loads((HERE / "operations.json").read_text())["operations"]))
        self.assertFalse(set(SECURITY_REFERENCE) & set(PASSWORD_SECURITY_REFERENCE))

    def test_public_paths_and_ids_follow_the_extension_contract(self):
        ext = json.loads(EXTENSION_BYTES)
        spec = {(m.upper(), p): o for p, item in ext["paths"].items() for m, o in item.items() if m in ("get", "post", "put")}
        for op in MANIFEST["operations"]:
            if op["id"] in PASSWORD_OPS:
                item = spec[(op["method"], op["backend_path"])]
                self.assertEqual((item["operationId"], item["x-public-apim-path"]), (op["id"], op["public_path"]))

    def test_classification_distinguishes_public_and_protected(self):
        ops = {o["id"]: o for o in MANIFEST["operations"]}
        for op_id in ANONYMOUS:
            self.assertEqual(("public", True, True, "none"), (ops[op_id]["auth"], ops[op_id]["origin"],
                                                             ops[op_id]["anonymous_admission"], ops[op_id]["csrf"]))
        self.assertEqual(("jwt", False, "none"), (ops["getOwnPasswordStatus"]["auth"], ops["getOwnPasswordStatus"]["origin"],
                                                 ops["getOwnPasswordStatus"]["csrf"]))
        for op_id in SESSION_CSRF:
            self.assertEqual(("jwt", True, "session", "none", False),
                             (ops[op_id]["auth"], ops[op_id]["origin"], ops[op_id]["csrf"], ops[op_id]["cookie_mode"],
                              ops[op_id]["anonymous_admission"]))


class FailClosedTest(unittest.TestCase):
    def test_staging_manifest_needs_the_extension(self):
        with self.assertRaises(ValueError):
            package(unapproved(), extension=None)

    def test_without_approvals_every_password_operation_is_a_terminal_denial(self):
        result = package(unapproved())
        d = defs(result)
        for op_id in ANONYMOUS:
            self.assertEqual(["abuse_protection_unapproved"], d[op_id]["blocked_reasons"], op_id)
        for op_id in PASSWORD_OPS - ANONYMOUS:
            self.assertEqual(["ms_users_contract_unreconciled"], d[op_id]["blocked_reasons"], op_id)
        for op_id in PASSWORD_OPS:
            log = simulate(result["policies"][op_id])
            self.assertEqual(("503", False, []), (log["denied"], log["backend"], log["parent_actions"]), op_id)

    def test_abuse_protection_alone_does_not_release_the_extension(self):
        manifest, directory = approved_case(self, names=("abuse_protection",))
        d = defs(package(manifest, directory))
        for op_id in PASSWORD_OPS:
            self.assertEqual(["ms_users_contract_unreconciled"], d[op_id]["blocked_reasons"], op_id)
        self.assertEqual("enabled", d["requestInstitutionalEmailLink"]["status"])

    def test_evidence_bound_to_users_json_only_is_rejected(self):
        base = (json.loads(OPENAPI_BYTES)["info"]["version"], hashlib.sha256(OPENAPI_BYTES).hexdigest())
        manifest, directory = approved_case(self, binding=base)
        with self.assertRaises(ValueError):
            package(manifest, directory)

    def test_binding_covers_both_files(self):
        version, digest = gp.contract_binding(OPENAPI_BYTES, EXTENSION_BYTES)
        self.assertEqual("0.3.0-draft+users-password-0.1.0-draft", version)
        self.assertNotEqual(digest, gp.contract_binding(OPENAPI_BYTES, EXTENSION_BYTES + b" ")[1])
        self.assertEqual(gp.contract_binding(OPENAPI_BYTES), (json.loads(OPENAPI_BYTES)["info"]["version"],
                                                              hashlib.sha256(OPENAPI_BYTES).hexdigest()))

    def test_manifest_cannot_downgrade_password_rows(self):
        for op_id, field, value in (("setOwnInitialPassword", "csrf", "none"), ("changeOwnPassword", "origin", False),
                                    ("getOwnPasswordStatus", "auth", "public"), ("loginWithPassword", "anonymous_admission", False),
                                    ("setOwnInitialPassword", "contract_status", "reconciled")):
            manifest = unapproved()
            next(o for o in manifest["operations"] if o["id"] == op_id)[field] = value
            with self.assertRaises(ValueError, msg=f"{op_id}.{field}"):
                package(manifest)

    def test_session_csrf_only_for_cookieless_jwt_writes(self):
        for op_id in ("loginWithPassword", "refreshSession", "getOwnPasswordStatus"):
            manifest = unapproved()
            next(o for o in manifest["operations"] if o["id"] == op_id)["csrf"] = "session"
            with self.assertRaises(ValueError, msg=op_id):
                gp.validate(manifest)

    def test_extension_must_be_disjoint_and_declare_its_base(self):
        ext = json.loads(EXTENSION_BYTES)
        wrong_base = copy.deepcopy(ext)
        wrong_base["x-extends"]["version"] = "0.2.0-draft"
        overlap = copy.deepcopy(ext)
        overlap["paths"]["/v1/me/profile"] = json.loads(OPENAPI_BYTES)["paths"]["/v1/me/profile"]
        missing = copy.deepcopy(ext)
        del missing["paths"]["/v1/me/password"]["put"]
        for bad in (wrong_base, overlap, missing):
            with self.assertRaises(ValueError):
                package(unapproved(), extension=json.dumps(bad).encode())


class ReleasedPolicyTest(unittest.TestCase):
    def setUp(self):
        manifest, directory = approved_case(self)
        self.result = package(manifest, directory)
        self.google = package(manifest, directory, profile="ms-users-google-v1")

    def inbound(self, op_id):
        return list(ET.fromstring(self.result["policies"][op_id]).find("inbound"))

    def test_profile_is_google_profile_plus_five(self):
        google = RELEASE_PROFILES["ms-users-google-v1"]
        spec = RELEASE_PROFILES[PROFILE]
        self.assertEqual(set(google["operations"]) | PASSWORD_OPS, set(spec["operations"]))
        self.assertEqual(15, len(spec["operations"]))
        self.assertEqual((google["api"], google["cors_allowed_headers"], google["cors_allowed_methods"]),
                         (spec["api"], spec["cors_allowed_headers"], spec["cors_allowed_methods"]))
        enabled = {d["id"] for d in self.result["definitions"] if d["status"] == "enabled"}
        self.assertEqual(set(spec["operations"]), enabled)

    def test_existing_policies_identical_under_both_profiles(self):
        for op_id in RELEASE_PROFILES["ms-users-google-v1"]["operations"]:
            self.assertEqual(self.google["policies"][op_id], self.result["policies"][op_id], op_id)
        for op_id in PASSWORD_OPS:
            self.assertIn("OPERATION_NOT_RELEASED", self.google["policies"][op_id])

    def test_anonymous_routes_check_origin_only_and_drop_user_tokens(self):
        for op_id in ANONYMOUS:
            xml = self.result["policies"][op_id]
            self.assertIn("ORIGIN_DENIED", xml)
            self.assertNotIn("CSRF_INVALID", xml)
            self.assertNotIn("validate-jwt", xml)
            self.assertNotIn("Cookie", xml)
            relocate = self.inbound(op_id)[-2]
            self.assertEqual((gp.USER_TOKEN_HEADER, "delete"), (relocate.attrib["name"], relocate.attrib["exists-action"]))

    def test_protected_routes_validate_jwt_and_relocate_it(self):
        for op_id in PASSWORD_OPS - ANONYMOUS:
            xml = self.result["policies"][op_id]
            tags = [e.tag for e in self.inbound(op_id)]
            self.assertIn("validate-jwt", tags, op_id)
            self.assertLess(tags.index("validate-jwt"), tags.index("authentication-managed-identity"), op_id)
            relocate = self.inbound(op_id)[-2]
            self.assertEqual((gp.USER_TOKEN_HEADER, "override"), (relocate.attrib["name"], relocate.attrib["exists-action"]))
            self.assertNotIn("REFRESH_INVALID", xml)  # no cookie requirement
            for header in gp.SPOOFABLE:
                self.assertIn(f'name="{header}" exists-action="delete"', xml)
        self.assertNotIn("CSRF_INVALID", self.result["policies"]["getOwnPasswordStatus"])
        self.assertNotIn("ORIGIN_DENIED", self.result["policies"]["getOwnPasswordStatus"])
        for op_id in SESSION_CSRF:
            self.assertIn("CSRF_INVALID", self.result["policies"][op_id])
            self.assertIn("ORIGIN_DENIED", self.result["policies"][op_id])

    def test_route_chain_reaches_each_java_endpoint(self):
        chain = {row["id"]: row for row in self.result["release"]["route_chain"]}
        self.assertEqual(15, len(chain))
        for op_id, (method, versionless, java) in PASSWORD_CALLS.items():
            self.assertEqual(method, chain[op_id]["method"])
            self.assertTrue(chain[op_id]["backend_url"].endswith(java), op_id)
            self.assertTrue(chain[op_id]["browser_url"].endswith("/users/v1" + versionless), op_id)

    def test_unknown_released_operation_has_no_expected_call(self):
        with self.assertRaises(ValueError):
            expected_calls(("loginWithPassword", "somethingElse"))


if __name__ == "__main__":
    unittest.main()
