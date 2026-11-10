"""Extensión `users-password.json`: aditiva, coherente con `users.json` y con la política B02."""
import json
import re
import unittest
from pathlib import Path

OPENAPI = Path(__file__).resolve().parents[1] / "openapi"
HTTP = {"get", "post", "put", "patch", "delete"}


def load(name):
    return json.loads((OPENAPI / name).read_text(encoding="utf-8"))


def operations(document):
    return {(route, method): op for route, item in document["paths"].items()
            for method, op in item.items() if method in HTTP}


class PasswordContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = load("users.json")
        cls.ext = load("users-password.json")
        cls.ops = operations(cls.ext)

    def test_declares_exactly_the_five_password_operations_and_never_overlaps_the_b07_document(self):
        self.assertEqual({
            ("/v1/auth/password/login", "post"), ("/v1/auth/password/recovery/requests", "post"),
            ("/v1/me/password", "get"), ("/v1/me/password", "post"), ("/v1/me/password", "put"),
        }, set(self.ops))
        self.assertFalse(set(self.ops) & set(operations(self.base)))
        ids = [op["operationId"] for op in self.ops.values()]
        base_ids = {op["operationId"] for op in operations(self.base).values()}
        self.assertEqual(len(ids), len(set(ids)))
        self.assertFalse(set(ids) & base_ids)
        for op in self.ops.values():
            self.assertEqual("proposed", op["x-implementation-status"])
            self.assertEqual("proposed", op["x-approval-status"])

    def test_every_reference_resolves(self):
        text = json.dumps(self.ext)
        for ref in set(re.findall(r'"\$ref": "#/([^"]+)"', text)):
            node = self.ext
            for part in ref.split("/"):
                self.assertIn(part, node, ref)
                node = node[part]

    def test_login_needs_no_bearer_no_link_and_returns_the_shared_auth_response(self):
        login = self.ops[("/v1/auth/password/login", "post")]
        self.assertNotIn("bearerAuth", json.dumps(login["security"]))
        ok = login["responses"]["200"]["content"]["application/json"]["schema"]
        self.assertEqual("#/components/schemas/AuthResponse", ok["$ref"])
        self.assertIn("Set-Cookie", login["responses"]["200"]["headers"])
        self.assertEqual(["INVALID_CREDENTIALS"], login["x-error-codes"]["401"])
        self.assertEqual(["RATE_LIMITED"], login["x-error-codes"]["429"])
        self.assertFalse(login["x-password-flow"]["magicLinkRequired"])
        self.assertIn("Retry-After", self.ext["components"]["responses"]["Auth429"]["headers"])

    def test_password_management_needs_bearer_and_session_csrf_on_every_write(self):
        for (route, method), op in self.ops.items():
            if route != "/v1/me/password":
                continue
            self.assertIn("bearerAuth", op["security"][0])
            refs = {p["$ref"] for p in op["parameters"]}
            if method in {"post", "put"}:
                self.assertIn("#/components/parameters/CsrfToken", refs)
                self.assertIn("#/components/parameters/Origin", refs)
        self.assertNotIn("userId", json.dumps(self.ext["components"]["schemas"]["SetPasswordRequest"]))

    def test_secrets_are_never_returned_and_requests_are_closed(self):
        for name in ("PasswordLoginRequest", "PasswordRecoveryRequest", "SetPasswordRequest", "ChangePasswordRequest",
                     "PasswordStatus", "PasswordConfigured"):
            self.assertIs(False, self.ext["components"]["schemas"][name]["additionalProperties"], name)
        for name in ("PasswordStatus", "PasswordConfigured"):
            self.assertFalse({"password", "newPassword", "currentPassword", "hash"}
                             & set(self.ext["components"]["schemas"][name]["properties"]))
        self.assertEqual(10, self.ext["components"]["schemas"]["SetPasswordRequest"]["properties"]["newPassword"]["minLength"])
        self.assertEqual(128, self.ext["components"]["schemas"]["SetPasswordRequest"]["properties"]["newPassword"]["maxLength"])

    def test_b02_recovery_never_replaces_an_existing_password(self):
        recovery = self.ops[("/v1/auth/password/recovery/requests", "post")]
        self.assertIn("CONTINUITY_REQUIRED", recovery["description"])
        self.assertIn("no reemplaza", recovery["description"].lower() + " " + recovery["x-b02-continuity"].lower().replace("no automatic replacement", "no reemplaza"))
        self.assertEqual({"202", "400", "403", "429", "503"} & set(recovery["responses"]), {"202", "400", "403", "429", "503"})
        # 202 identical for every address: the response never carries account state.
        schema = recovery["responses"]["202"]["content"]["application/json"]["schema"]["$ref"]
        self.assertEqual("#/components/schemas/MagicLinkRequested", schema)

    def test_error_vocabulary_is_closed_and_every_declared_code_is_in_the_envelope_enum(self):
        enum = set(self.ext["components"]["schemas"]["AuthErrorEnvelope"]["allOf"][1]["properties"]["error"]["properties"]["code"]["enum"])
        declared = {code for op in self.ops.values() for codes in op["x-error-codes"].values() for code in codes}
        self.assertTrue(declared <= enum, declared - enum)
        for code in ("INVALID_CREDENTIALS", "WEAK_PASSWORD", "PASSWORD_ALREADY_SET", "PASSWORD_NOT_SET",
                     "PASSWORD_SETUP_NOT_AUTHORIZED"):
            self.assertIn(code, enum)
        # B07 document is untouched: it does not know these codes (they live only in the extension).
        base_enum = set(self.base["components"]["schemas"]["AuthErrorEnvelope"]["allOf"][1]["properties"]["error"]["properties"]["code"]["enum"])
        self.assertFalse(base_enum & {"INVALID_CREDENTIALS", "WEAK_PASSWORD"})


if __name__ == "__main__":
    unittest.main()
