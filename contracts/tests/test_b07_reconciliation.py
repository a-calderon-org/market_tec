"""MTEC-15/B07 reconciliation checks.

These tests keep the reconciliation matrix, the observed ms-users fixtures and the proposed core-flow
fixture consistent with the OpenAPI draft and the APIM manifest. They do not exercise a running
service, do not approve B07 and do not record any team conformity.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from test_auth_contracts import FIXTURES, API_PATH, ROOT, load, validate_semantics, validator

MATRIX_PATH = FIXTURES / "b07-reconciliation-matrix.json"
OBSERVED_PATH = FIXTURES / "observed-ms-users-2089897.json"
PROPOSED_PATH = FIXTURES / "proposed-core-flow.json"
APIM_PATH = ROOT / "infra/apim/operations.json"
DOCS = ROOT / "docs"
MATRIX_DOC = DOCS / "MTEC15_B07_RECONCILIATION_MATRIX.md"
REGISTER_DOC = DOCS / "MTEC15_B07_DECISION_REGISTER.md"
PLAN_DOC = DOCS / "MTEC15_B07_AUTH_CORE_INCREMENT_1.md"
IDENTITY_DOC = ROOT / "contracts/identity/IDENTITY_CONTRACT.md"

HTTP_METHODS = {"get", "post", "put", "delete"}
KINDS = {"doc-only", "behavior", "needs-authorization"}
PRIORITIES = {"P0", "P1", "P2", "P3"}
JAVA_STATES = {"gated", "gated-refuses", "always-on", "metadata-gated"}
AUTH_ERROR_SCHEMA = "AuthErrorEnvelope"


def operations(api):
    for route, item in api["paths"].items():
        for method, op in item.items():
            if method in HTTP_METHODS:
                yield route, method, op


class B07ReconciliationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = load(API_PATH)
        cls.matrix = load(MATRIX_PATH)
        cls.observed = load(OBSERVED_PATH)
        cls.proposed = load(PROPOSED_PATH)
        cls.apim = load(APIM_PATH)
        cls.ops_by_id = {op["operationId"]: (route, method, op) for route, method, op in operations(cls.api)}
        cls.error_enum = set(
            cls.api["components"]["schemas"][AUTH_ERROR_SCHEMA]["allOf"][1]["properties"]["error"]["properties"]["code"]["enum"]
        )

    # ---------------------------------------------------------------- matrix

    def test_matrix_never_claims_approval(self):
        self.assertEqual("draft-not-approved", self.matrix["status"])
        self.assertIs(False, self.matrix["b07Approved"])
        self.assertEqual([], self.matrix["conformities"])
        self.assertEqual("draft-pending-team-approval", self.api["x-contract-status"])
        self.assertEqual("0.3.0-draft", self.api["info"]["version"])
        self.assertIs(False, self.proposed["approved"])
        self.assertEqual("proposed", self.proposed["kind"])
        self.assertEqual("observed", self.observed["kind"])

    def test_matrix_covers_every_openapi_operation_exactly_once(self):
        listed = [(o["operationId"], o["method"], o["path"]) for o in self.matrix["operations"]]
        self.assertEqual(len(listed), len(set(listed)), "duplicate matrix rows")
        expected = {(op["operationId"], method.upper(), route) for route, method, op in operations(self.api)}
        self.assertEqual(expected, set(listed))
        self.assertEqual(22, len(listed))

    def test_matrix_rows_use_known_vocabulary(self):
        decisions = set(self.matrix["decisions"])
        ids = []
        for row in self.matrix["operations"]:
            self.assertIn(row["javaState"], JAVA_STATES, row["operationId"])
            self.assertIn(row["decision"], decisions | {None}, row["operationId"])
            for field in ("requestJava", "requestOpenapi", "responseJava", "responseOpenapi",
                          "transport", "httpJava", "httpOpenapi", "envelope", "apim", "angular", "acceptance"):
                self.assertIn(field, row, f"{row['operationId']} lacks {field}")
            for divergence in row["divergences"]:
                ids.append(divergence["id"])
                self.assertIn(divergence["kind"], KINDS, divergence["id"])
                self.assertIn(divergence["priority"], PRIORITIES, divergence["id"])
                self.assertIn(divergence["decision"], decisions | {None}, divergence["id"])
                if divergence["kind"] != "doc-only":
                    self.assertIsNotNone(divergence["decision"], f"{divergence['id']} changes behavior without a decision")
        self.assertEqual(len(ids), len(set(ids)), "duplicate divergence ids")
        for item in self.matrix["angularDivergences"]:
            self.assertIn(item["kind"], KINDS, item["id"])
            self.assertIn(item["priority"], PRIORITIES, item["id"])
            self.assertIn(item["decision"], decisions | {None}, item["id"])

    def test_matrix_http_codes_match_openapi(self):
        for row in self.matrix["operations"]:
            _, _, op = self.ops_by_id[row["operationId"]]
            self.assertEqual(set(op["responses"]), set(row["httpOpenapi"]), row["operationId"])

    def test_matrix_apim_columns_match_manifest(self):
        manifest = {item["id"]: item for item in self.apim["operations"]}
        self.assertEqual(set(self.ops_by_id), set(manifest))
        for row in self.matrix["operations"]:
            item = manifest[row["operationId"]]
            self.assertEqual(
                {"auth": item["auth"], "cookieMode": item["cookie_mode"], "csrf": item["csrf"],
                 "contractStatus": item["contract_status"]},
                row["apim"], row["operationId"])
            self.assertEqual(row["method"], item["method"], row["operationId"])

    def test_apim_approvals_stay_null(self):
        self.assertEqual({"abuse_protection": None, "ms_users_contract": None}, self.apim["approvals"])

    def test_acceptance_ids_are_defined(self):
        catalog = self.matrix["acceptanceCatalog"]
        used = {a for row in self.matrix["operations"] for a in row["acceptance"]}
        self.assertEqual(used, set(catalog))
        for ident, entry in catalog.items():
            self.assertIn(entry["status"], {"observed", "proposed", "observed-and-proposed"}, ident)

    def test_documents_list_every_operation_divergence_and_decision(self):
        matrix_doc = MATRIX_DOC.read_text(encoding="utf-8")
        register_doc = REGISTER_DOC.read_text(encoding="utf-8")
        for row in self.matrix["operations"]:
            self.assertIn(row["operationId"], matrix_doc)
            for divergence in row["divergences"]:
                self.assertIn(divergence["id"], matrix_doc)
        for item in self.matrix["angularDivergences"]:
            self.assertIn(item["id"], matrix_doc)
        for decision in self.matrix["decisions"]:
            self.assertRegex(register_doc, rf"### {decision} ")
        self.assertIn("B07 no está aprobado", register_doc)
        self.assertTrue(PLAN_DOC.exists())

    # --------------------------------------------------------- observed cases

    def test_observed_cases_validate_as_declared(self):
        ids = [case["id"] for case in self.observed["cases"]]
        self.assertEqual(len(ids), len(set(ids)))
        for case in self.observed["cases"]:
            with self.subTest(case["id"]):
                route, method, op = self.ops_by_id[case["operationId"]]
                status = str(case["response"]["status"])
                if case.get("statusDeclaredInOpenapi", True):
                    self.assertIn(status, op["responses"], f"{status} undeclared for {case['operationId']}")
                else:
                    self.assertNotIn(status, op["responses"], f"{status} is now declared; update the fixture")
                self._check_observed_body(case)
                self._check_observed_request(case)

    def _check_observed_body(self, case):
        schema = case["schema"]
        body = case["response"].get("body")
        if schema is None:
            self.assertIsNone(body)
            return
        errors = list(validator(self.api, schema).iter_errors(body))
        if case["validatesAgainstOpenapi"]:
            self.assertEqual([], [e.message for e in errors])
            validate_semantics(schema, body)
        else:
            self.assertTrue(errors, "case marked divergent now validates; update the fixture and the matrix")
        for code in case.get("outOfEnumCodes", []):
            self.assertNotIn(code, self.error_enum, f"{code} is now in the OpenAPI enum; update the fixture")
            self.assertEqual(code, body["error"]["code"])
        if "noSetCookie" in case["response"]:
            self.assertNotIn("Set-Cookie", case["response"].get("headers", {}))
        if "noToken" in case["response"]:
            self.assertNotIn("token", body)

    def _check_observed_request(self, case):
        if "requestSchema" not in case:
            return
        errors = list(validator(self.api, case["requestSchema"]).iter_errors(case["request"]["body"]))
        if case.get("requestValidatesAgainstOpenapi", True):
            self.assertEqual([], [e.message for e in errors])
        else:
            self.assertTrue(errors, "request marked divergent now validates; update the fixture")

    def test_observed_error_code_inventory_is_consistent(self):
        outside = set(self.observed["javaErrorCodesNotInOpenapiEnum"])
        never = set(self.observed["openapiErrorCodesNeverEmittedByJava"])
        self.assertFalse(outside & self.error_enum, "a Java code entered the enum; move it out of the divergence list")
        self.assertTrue(never <= self.error_enum)
        emitted_in_cases = {c["response"]["body"]["error"]["code"] for c in self.observed["cases"]
                            if isinstance(c["response"].get("body"), dict) and "error" in c["response"]["body"]}
        self.assertFalse(emitted_in_cases & never, "a code listed as never emitted appears in an observed case")
        for code in emitted_in_cases:
            self.assertIn(code, self.error_enum | outside, code)
        for case in self.observed["cases"]:
            for ident in case["divergenceIds"]:
                self.assertIn(ident, {d["id"] for r in self.matrix["operations"] for d in r["divergences"]}, ident)

    def test_observed_auth_response_uses_internal_session_not_google_credential(self):
        exchange = next(c for c in self.observed["cases"] if c["id"] == "obs-google-exchange-200")
        self.assertNotIn("credential", exchange["response"]["body"])
        self.assertEqual("Bearer", exchange["response"]["body"]["tokenType"])
        self.assertTrue(exchange["response"]["body"]["user"]["userId"])
        cookies = exchange["response"]["headers"]["Set-Cookie"]
        self.assertTrue(any(c.startswith("__Host-mtec-refresh=") and "HttpOnly" in c and "Secure" in c and "Domain" not in c
                            for c in cookies))

    # --------------------------------------------------------- proposed flow

    def test_proposed_flow_uses_only_declared_operations_and_statuses(self):
        called = set(self.proposed["operationsCalledByAngular"])
        blocked = set(self.proposed["operationsAngularMustNotCall"])
        self.assertTrue(called <= set(self.ops_by_id))
        self.assertTrue(blocked <= set(self.ops_by_id))
        self.assertFalse(called & blocked)
        decisions = set(self.matrix["decisions"])
        self.assertTrue(set(self.proposed["operationsAngularMustNotCall"].values()) <= decisions)
        for name, flow in self.proposed["flows"].items():
            self.assertIn(flow["decision"], decisions, name)
            for step in flow["steps"]:
                call = step.get("call")
                if not call:
                    continue
                self.assertIn(call, called, f"{name} calls {call}, which is not in the allowed set")
                _, _, op = self.ops_by_id[call]
                if "expect" in step:
                    self.assertIn(str(step["expect"]), op["responses"], f"{name}/{call}")
                for status in step.get("onStatus", {}):
                    self.assertIn(status, op["responses"], f"{name}/{call}")
                body = step.get("body", {})
                if call == "refreshSession":
                    self.assertEqual({"mode": "rotate"}, body)
                if call == "logoutSession":
                    self.assertEqual({"scope": "current"}, body)
                if call == "createAuthenticationAttempt":
                    self.assertEqual("google", body.get("method"))
                    self.assertIn(body.get("purpose"), {"login", "register"})

    def test_proposed_flow_keeps_credentials_out_of_web_storage(self):
        policy = self.proposed["storagePolicy"]
        self.assertEqual([], policy["localStorage"])
        self.assertEqual([], policy["sessionStorage"])
        self.assertEqual([], policy["indexedDb"])
        self.assertEqual("memory", policy["accessToken"])
        self.assertEqual("memory", policy["csrfToken"])
        self.assertEqual("never-stored", policy["googleCredential"])
        self.assertIs(False, self.proposed["credentialsPolicy"]["apimSubscriptionKeyFromSpa"])

    def test_proposed_flow_routes_exist_and_are_not_mixed(self):
        paths = set(self.api["paths"])
        policy = self.proposed["credentialsPolicy"]
        self.assertTrue(set(policy["withCredentialsRoutes"]) <= paths)
        self.assertTrue(set(policy["bearerRoutes"]) <= paths)
        self.assertTrue(set(policy["neverSendBearerTo"]) <= paths)
        self.assertFalse(set(policy["bearerRoutes"]) & set(policy["neverSendBearerTo"]))
        self.assertFalse(set(policy["withCredentialsRoutes"]) & set(policy["bearerRoutes"]))

    def test_error_map_covers_every_known_code(self):
        known = self.error_enum | set(self.observed["javaErrorCodesNotInOpenapiEnum"])
        mapped = set(self.proposed["errorMap"])
        self.assertEqual(known, mapped)
        for code, entry in self.proposed["errorMap"].items():
            self.assertTrue(entry["action"], code)
            self.assertTrue(entry["http"], code)

    def test_release_gates_keep_blocked_features_off(self):
        gates = self.proposed["releaseGates"]
        self.assertIn("users.email.enabled", gates["msUsersFlagsThatMustStayOff"])
        self.assertIn("users.auth-methods.linking.enabled", gates["msUsersFlagsThatMustStayOff"])
        self.assertIs(False, gates["angularFeatureFlag"]["default"])
        self.assertEqual(["abuse_protection", "ms_users_contract"], gates["apimApprovalsRemainNull"])

    # --------------------------------------------------- documentation checks

    def test_identity_contract_no_longer_cites_stale_foundation_commit(self):
        text = IDENTITY_DOC.read_text(encoding="utf-8")
        self.assertNotIn("ms-users/main@3f776f6", text)
        self.assertIn("20898978d7f49c38e21b49187250bdd1821c370f", text)

    def test_new_documents_do_not_declare_b07_approved(self):
        for path in (MATRIX_DOC, REGISTER_DOC, PLAN_DOC):
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(text, re.compile(r"B07\s+(está\s+)?aprobado(?!\s*\))", re.I), path.name)


if __name__ == "__main__":
    unittest.main()
