import base64
import copy
import json
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from generate_policies import SPOOFABLE, generate, validate

ISS, AUD = "https://users.example.com", "markettec-api"
MANIFEST = json.loads(Path(__file__).with_name("operations.json").read_text())
KEY = {"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "key1", "e": "AQAB",
       "n": base64.urlsafe_b64encode(bytes([128]) + bytes(254) + bytes([1])).decode().rstrip("=")}
JWKS = {"keys": [KEY]}
EXPECTED = {
    ("GET", "/v1/me/profile"): "jwt", ("PUT", "/v1/me/profile"): "jwt",
    ("GET", "/v1/usuarios/{userId}"): "jwt", ("PUT", "/v1/usuarios/{userId}"): "jwt",
    ("GET", "/v1/me/auth-methods"): "jwt", ("POST", "/v1/me/auth-methods"): "jwt_cookie",
    ("POST", "/v1/auth/refresh"): "cookie", ("GET", "/v1/auth/session"): "cookie",
    ("POST", "/v1/auth/logout"): "cookie", ("POST", "/v1/auth/session/activity"): "jwt_cookie",
    ("GET", "/.well-known/jwks.json"): "public", ("GET", "/.well-known/markettec-identity"): "public",
}


class ManifestTest(unittest.TestCase):
    def test_routes_and_classification(self):
        routes = {(o["method"], o["path"]): o["auth"] for o in validate(MANIFEST)}
        for route, auth in EXPECTED.items():
            self.assertEqual(auth, routes[route], route)

    def test_every_operation_has_a_unique_policy(self):
        self.assertEqual(len(MANIFEST["operations"]), len(generate(MANIFEST, JWKS, ISS, AUD)))

    def test_fail_closed_on_bad_manifest(self):
        def mutate(fn):
            m = copy.deepcopy(MANIFEST)
            fn(m)
            with self.assertRaises(ValueError):
                validate(m)
        mutate(lambda m: m["operations"][0].update(auth="none"))
        mutate(lambda m: m["operations"][0].update(path="/a/../b"))
        mutate(lambda m: m["operations"].append(dict(m["operations"][0])))
        mutate(lambda m: m["operations"][0].update(extra=1))
        mutate(lambda m: m.update(abuse_protection_verified="yes"))
        mutate(lambda m: next(o for o in m["operations"] if o["auth"] == "jwt").update(anonymous_admission=True))
        mutate(lambda m: next(o for o in m["operations"] if o["auth"] == "cookie").update(cookies=[]))

    def test_jwt_operations_require_jwks(self):
        with self.assertRaises(ValueError):
            generate(MANIFEST, None, ISS, AUD)


class PolicyTest(unittest.TestCase):
    def setUp(self):
        self.policies = generate(MANIFEST, JWKS, ISS, AUD)
        self.ops = {o["id"]: o for o in MANIFEST["operations"]}

    def test_base_inherited_once_and_headers_stripped(self):
        for name, xml in self.policies.items():
            root = ET.fromstring(xml)
            for section in ("inbound", "backend", "outbound", "on-error"):
                self.assertEqual(1, len(root.findall(f"./{section}/base")), (name, section))
            self.assertEqual("base", root.find("./inbound")[0].tag)
            stripped = {h.attrib["name"] for h in root.findall("./inbound/set-header") if h.attrib.get("exists-action") == "delete"}
            self.assertTrue(set(SPOOFABLE) <= stripped, name)

    def test_internal_jwt_replaces_google_validation(self):
        for name, xml in self.policies.items():
            root = ET.fromstring(xml)
            check = root.find("./inbound/validate-jwt")
            if self.ops[name]["auth"] in ("jwt", "jwt_cookie"):
                self.assertEqual(ISS, check.find("./issuers/issuer").text)
                self.assertEqual(AUD, check.find("./audiences/audience").text)
                self.assertEqual("0", check.attrib["clock-skew"])
                self.assertIn("RS256", ET.fromstring(xml).find("./inbound/choose/when").attrib["condition"])
                self.assertNotIn("<claim", xml)
            else:
                self.assertIsNone(check, name)
            for forbidden in ("accounts.google.com", "openid-config", "<d>", 'name="d"'):
                self.assertNotIn(forbidden, xml, name)

    def test_cookie_operations_do_not_touch_cookies(self):
        for name, xml in self.policies.items():
            self.assertNotIn("Cookie", xml.replace("Set-Cookie", "") if self.ops[name]["auth"] != "public" else "", name)

    def test_anonymous_admission_blocked_until_abuse_protection(self):
        blocked = [n for n, o in self.ops.items() if o["anonymous_admission"]]
        self.assertGreaterEqual(len(blocked), 5)
        for name in blocked:
            root = ET.fromstring(self.policies[name])
            self.assertEqual("503", root.find("./inbound/return-response/set-status").attrib["code"])
        open_manifest = copy.deepcopy(MANIFEST)
        open_manifest["abuse_protection_verified"] = True
        opened = generate(open_manifest, JWKS, ISS, AUD)
        for name in blocked:
            self.assertNotIn("return-response", opened[name])

    def test_committed_manifest_keeps_admission_blocked(self):
        self.assertFalse(MANIFEST["abuse_protection_verified"])


if __name__ == "__main__":
    unittest.main()
