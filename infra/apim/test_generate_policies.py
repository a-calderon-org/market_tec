import base64
import copy
import json
import re
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from generate_policies import SPOOFABLE, check_upstream, generate, validate, verify_sources

HERE = Path(__file__).parent
ISS, AUD = "https://users.example.com", "markettec-api"
MANIFEST = json.loads((HERE / "operations.json").read_text())
OPENAPI = json.loads((HERE / "../../contracts/openapi/users.json").read_text())
ROUTES = json.loads((HERE / "backend-routes.json").read_text())
KEY = {"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "key1", "e": "AQAB",
       "n": base64.urlsafe_b64encode(bytes([128]) + bytes(254) + bytes([1])).decode().rstrip("=")}
JWKS = {"keys": [KEY]}
CLEAN = "<policies><inbound><cors /></inbound></policies>"
UPSTREAM = {"global": CLEAN, "product": CLEAN, "api": CLEAN}
PENDING = {"createMethodProofAttempt", "verifyGoogleMethodProof", "requestEmailMethodProof",
           "verifyEmailMethodProof", "linkOwnAuthMethod"}
ADMISSION = {"createAuthenticationAttempt", "exchangeGoogleCredential", "legacyGoogleRegistrationCompatibility",
             "requestInstitutionalEmailLink", "confirmInstitutionalEmailLink"}


def build(manifest=MANIFEST, upstream=None, **kw):
    return generate(manifest, JWKS, ISS, AUD, upstream, OPENAPI, ROUTES, **kw)


def mutated(fn):
    m = copy.deepcopy(MANIFEST)
    fn(m)
    return m


def op_of(m, op_id):
    return next(o for o in m["operations"] if o["id"] == op_id)


class RoutesTest(unittest.TestCase):
    def test_manifest_matches_openapi_and_controllers(self):
        verify_sources(MANIFEST, OPENAPI, ROUTES)
        self.assertEqual(22, len(MANIFEST["operations"]))

    def test_public_paths_follow_x_public_apim_path(self):
        ops = {o["id"]: o for o in MANIFEST["operations"]}
        self.assertEqual("/auth/google", ops["exchangeGoogleCredential"]["public_path"])
        self.assertEqual("/v1/auth/google", ops["exchangeGoogleCredential"]["backend_path"])
        self.assertEqual("/usuarios/{userId}", ops["getUserProfile"]["public_path"])
        self.assertEqual("/health", ops["getUsersHealth"]["public_path"])

    def test_inconsistent_mappings_rejected(self):
        for fn in (lambda m: op_of(m, "getUserProfile").update(public_path="/users/{userId}"),
                   lambda m: op_of(m, "getUserProfile").update(backend_path="/v1/usuarios/{id}"),
                   lambda m: op_of(m, "refreshSession").update(backend_path="/v1/auth/refreshx"),
                   lambda m: op_of(m, "refreshSession").update(public_path=op_of(m, "getSessionState")["public_path"], method="GET"),
                   lambda m: m["operations"].pop()):
            with self.assertRaises(ValueError):
                verify_sources(mutated(fn), OPENAPI, ROUTES)

    def test_duplicates_and_bad_fields_rejected(self):
        for fn in (lambda m: m["operations"].append(copy.deepcopy(m["operations"][0])),
                   lambda m: m["operations"][0].update(auth="none"),
                   lambda m: m["operations"][0].update(public_path="/a/../b"),
                   lambda m: m["operations"][0].update(extra=1),
                   lambda m: m.update(abuse_protection_verified="yes"),
                   lambda m: op_of(m, "getOwnUserProfile").update(anonymous_admission=True),
                   lambda m: op_of(m, "refreshSession").update(cookies=[], cookie_mode="none"),
                   lambda m: op_of(m, "refreshSession").update(csrf="none"),
                   lambda m: op_of(m, "refreshSession").update(origin=False),
                   lambda m: op_of(m, "getSessionState").update(csrf="required"),
                   lambda m: op_of(m, "logoutSession").update(cookie_mode="required")):
            with self.assertRaises(ValueError):
                validate(mutated(fn))


class DefinitionTest(unittest.TestCase):
    def setUp(self):
        self.result = build()
        self.defs = {d["id"]: d for d in self.result["definitions"]}

    def test_definition_applies_backend_path_and_policy(self):
        for op in MANIFEST["operations"]:
            d = self.defs[op["id"]]
            self.assertEqual((op["method"], op["public_path"], "ms-users", op["backend_path"]),
                             (d["method"], d["url_template"], d["backend"], d["backend_path"]))
            rewrite = ET.fromstring(self.result["policies"][op["id"]]).find("./inbound/rewrite-uri")
            if d["status"] == "blocked" and d["blocked_reasons"][0] != "inherited_policy_scopes_unverified":
                self.assertIsNone(rewrite)
            else:
                self.assertEqual(op["backend_path"], rewrite.attrib["template"])
            self.assertEqual(64, len(d["policy_sha256"]))

    def test_nothing_enabled_without_verified_upstream_scopes(self):
        for d in self.defs.values():
            self.assertEqual("blocked", d["status"])
            self.assertIn("inherited_policy_scopes_unverified", d["blocked_reasons"])

    def test_enabled_only_with_clean_upstream_and_no_flags(self):
        d = {x["id"]: x for x in build(upstream=UPSTREAM)["definitions"]}
        self.assertEqual("enabled", d["getOwnUserProfile"]["status"])
        self.assertEqual("enabled", d["refreshSession"]["status"])
        for name in ADMISSION:
            self.assertEqual(["abuse_protection_unverified"], d[name]["blocked_reasons"])
        for name in PENDING:
            self.assertEqual(["ms_users_contract_unreconciled"], d[name]["blocked_reasons"])
        partial = {x["id"]: x for x in build(upstream={"global": CLEAN})["definitions"]}
        self.assertEqual("blocked", partial["getOwnUserProfile"]["status"])

    def test_inherited_validation_is_detected_fail_closed(self):
        for bad in ("<policies><inbound><validate-jwt /></inbound></policies>",
                    '<policies><inbound><x u="https://accounts.google.com"/></inbound></policies>',
                    "<policies><inbound><openid-config/></inbound></policies>", "<policies"):
            with self.assertRaises(ValueError):
                check_upstream("api", bad)
            with self.assertRaises(ValueError):
                build(upstream=dict(UPSTREAM, product=bad))
        with self.assertRaises(ValueError):
            build(upstream={"operation": CLEAN})

    def test_flags_open_admission_and_contract_routes_independently(self):
        admission = build(mutated(lambda m: m.update(abuse_protection_verified=True)), UPSTREAM)
        d = {x["id"]: x for x in admission["definitions"]}
        for name in ADMISSION:
            self.assertEqual("enabled", d[name]["status"])
        for name in PENDING:
            self.assertEqual("blocked", d[name]["status"])
        contract = {x["id"]: x for x in build(mutated(lambda m: m.update(contract_reconciliation_verified=True)), UPSTREAM)["definitions"]}
        for name in PENDING:
            self.assertEqual("enabled", contract[name]["status"])
        for name in ADMISSION:
            self.assertEqual("blocked", contract[name]["status"])


class PolicyTest(unittest.TestCase):
    def setUp(self):
        self.policies = build()["policies"]
        self.ops = {o["id"]: o for o in MANIFEST["operations"]}

    def conditions(self, name):
        return [w.attrib["condition"] for w in ET.fromstring(self.policies[name]).findall("./inbound/choose/when")]

    def codes(self, name):
        return [json.loads(w.find("./return-response/set-body").text)["error"]["code"]
                for w in ET.fromstring(self.policies[name]).findall("./inbound/choose/when") if w.find("./return-response/set-body") is not None
                and w.find("./return-response/set-body").text.startswith('{"error"')]

    def test_base_inherited_once_and_headers_stripped(self):
        for name, xml in self.policies.items():
            root = ET.fromstring(xml)
            for section in ("inbound", "backend", "outbound", "on-error"):
                self.assertEqual(1, len(root.findall(f"./{section}/base")), (name, section))
            self.assertEqual("base", root.find("./inbound")[0].tag)
            stripped = {h.attrib["name"] for h in root.findall("./inbound/set-header") if h.attrib.get("exists-action") == "delete"}
            self.assertTrue(set(SPOOFABLE) <= stripped, name)

    def test_internal_jwt_validation_only_on_jwt_classes(self):
        for name, xml in self.policies.items():
            op, root = self.ops[name], ET.fromstring(xml)
            check = root.find("./inbound/validate-jwt")
            if op["auth"] in ("jwt", "jwt_cookie") and name not in PENDING:
                self.assertEqual(ISS, check.find("./issuers/issuer").text)
                self.assertEqual(AUD, check.find("./audiences/audience").text)
                self.assertEqual("0", check.attrib["clock-skew"])
                self.assertEqual("true", check.attrib["require-expiration-time"])
                self.assertIn("RS256", xml)
                self.assertIn("at+jwt", xml)
                self.assertEqual(["key1"], [k.attrib["id"] for k in check.findall("./issuer-signing-keys/key")])
                self.assertEqual("Bearer", check.attrib["require-scheme"])
            else:
                self.assertIsNone(check, name)
            for forbidden in ("accounts.google.com", "openid-config", 'name="d"'):
                self.assertNotIn(forbidden, xml, name)

    def test_origin_enforced_exactly_where_contract_requires_it(self):
        for name, op in self.ops.items():
            if name in ADMISSION | PENDING:
                continue
            has = any("allowed-origins" in c for c in self.conditions(name))
            self.assertEqual(op["origin"], has, name)
        self.assertIn("ORIGIN_DENIED", self.codes("refreshSession"))
        self.assertNotIn("allowed-origins", self.policies["getSessionState"])

    def test_required_cookie_and_csrf_checks(self):
        for name in ("refreshSession", "recordSessionActivity"):
            conditions = " ".join(self.conditions(name))
            self.assertIn("__Host-mtec-refresh", conditions)
            self.assertIn(".Count != 1", conditions)
            self.assertEqual(["ORIGIN_DENIED", "REFRESH_INVALID", "CSRF_INVALID"], self.codes(name)[:3] if name == "refreshSession" else [c for c in self.codes(name) if c != "INVALID_TOKEN"])
        self.assertNotIn("__Host-mtec-attempt", self.policies["refreshSession"])

    def test_logout_remains_idempotent_without_cookie(self):
        conditions = self.conditions("logoutSession")
        cookie_check = next(c for c in conditions if "> 1" in c)
        csrf_check = next(c for c in conditions if "X-CSRF-Token" in c)
        self.assertNotIn("!= 1", cookie_check)  # absent cookie is not rejected
        self.assertIn("== 1) &&", csrf_check)    # CSRF demanded only when cookie present
        self.assertEqual(["ORIGIN_DENIED", "REFRESH_INVALID", "CSRF_INVALID"], self.codes("logoutSession"))

    def test_session_snapshot_validates_cookie_format_only_if_present(self):
        conditions = " ".join(self.conditions("getSessionState"))
        self.assertIn("> 1", conditions)
        self.assertNotIn("!= 1", conditions)
        self.assertNotIn("CSRF", self.policies["getSessionState"])

    def test_cookie_is_never_identity(self):
        for name, xml in self.policies.items():
            if self.ops[name]["auth"] in ("cookie", "public"):
                root = ET.fromstring(xml)
                self.assertIsNone(root.find("./inbound/validate-jwt"))
                for header in root.findall(".//set-header"):
                    if header.attrib["name"] in SPOOFABLE:
                        self.assertEqual("delete", header.attrib["exists-action"])
                self.assertNotIn("set-variable", xml)
            self.assertNotIn("remove-cookie", xml.lower())

    def test_attempt_cookie_used_for_attempt_proof_routes(self):
        open_policies = build(mutated(lambda m: m.update(abuse_protection_verified=True)), UPSTREAM)["policies"]
        for name in ADMISSION - {"createAuthenticationAttempt"}:
            self.assertIn("__Host-mtec-attempt", open_policies[name])
            self.assertIn("CSRF_INVALID", open_policies[name])
        self.assertNotIn("__Host-mtec-attempt", open_policies["createAuthenticationAttempt"])
        self.assertNotIn("CSRF_INVALID", open_policies["createAuthenticationAttempt"])

    def test_blocked_routes_answer_503_and_never_reach_backend(self):
        for name in ADMISSION | PENDING:
            root = ET.fromstring(self.policies[name])
            self.assertEqual("503", root.find("./inbound/return-response/set-status").attrib["code"])
            self.assertIsNone(root.find("./inbound/rewrite-uri"))
            self.assertIsNone(root.find("./inbound/validate-jwt"))
        self.assertIn("ADMISSION_DISABLED", self.policies["exchangeGoogleCredential"])
        self.assertIn("BACKEND_CONTRACT_PENDING", self.policies["linkOwnAuthMethod"])

    def test_committed_manifest_keeps_flags_closed(self):
        self.assertFalse(MANIFEST["abuse_protection_verified"])
        self.assertFalse(MANIFEST["contract_reconciliation_verified"])

    def test_jwt_operations_require_jwks(self):
        with self.assertRaises(ValueError):
            generate(MANIFEST, None, ISS, AUD)

    def test_cookie_regex_literals_are_valid(self):
        for xml in self.policies.values():
            for cond in (w.attrib["condition"] for w in ET.fromstring(xml).findall("./inbound/choose/when")):
                for pattern in re.findall(r'@"([^"]+)"', cond):
                    re.compile(pattern.replace("\\s", " "))


if __name__ == "__main__":
    unittest.main()
