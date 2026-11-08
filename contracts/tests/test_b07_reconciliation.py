"""MTEC-15/B07 reconciliation checks.

These tests keep the reconciliation matrix, the observed ms-users fixtures and the proposed core-flow
fixture consistent with the OpenAPI draft and the APIM manifest. They do not exercise a running
service, do not approve B07 and do not record any team conformity.
"""
from __future__ import annotations

import hashlib
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

# --- Retry-after-401 sentence check (D-11) --------------------------------------------------------------
# This is a secondary guard against documentary contradictions. The primary protection of D-11 is the
# structured fixture check (retryPolicy.automaticReplayAfter401 must be false for every HTTP method).
#
# A sentence that pairs a business method with retry/replay vocabulary is acceptable only when EACH retry
# mention is negated in its own clause: a negator must sit within RETRY_NEGATION_WINDOW words before it,
# with no clause boundary (comma, semicolon, colon, parenthesis, conjunction or condition) in between.
# A negation anywhere else in the sentence ("...si no hay errores de red") does not count.
#
# Retry mentions are the retry words below plus the phrases "volver a <enviar|intentar|...>" and
# "enviar de nuevo". The labels "política de reintentos" and "reintentos futuros" are descriptive references,
# but only while nothing in their clause orders or runs the retry: a clause that pairs a label with an
# authorizing/executing verb that is not itself negated ("la política de reintentos ordena ...",
# "ejecuta los reintentos futuros") is treated as an instruction. Labels are never stripped from the text.
RETRY_METHODS = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE)\b|mutaci|petici[oó]n(es)? de negocio|business request", re.I)
RETRY_WORDS = re.compile(r"^(reintent\w*|repet\w*|repite\w*|replay\w*|reenv\w*|reejecut\w*|reproduc\w*|"
                         r"retr(y|ies|ied|ying)|repeat\w*|resend\w*)$", re.I)
RETRY_AGAIN_VERBS = {"enviar", "intentar", "repetir", "ejecutar", "reproducir", "hacer", "lanzar", "emitir", "mandar"}
RETRY_ACTION_VERBS = re.compile(r"^(orden\w*|ejecut\w*|permit\w*|autoriz\w*|habilit\w*|activ\w*|aplic\w*|dispar\w*|"
                                r"realiz\w*|efect[uú]\w*|order\w*|execut\w*|allow\w*|enabl\w*|authori[sz]\w*|trigger\w*|"
                                r"perform\w*|run|runs)$", re.I)
RETRY_NEGATORS = re.compile(r"^(no|ni|nunca|jam[aá]s|ning[uú]n\w*|sin|proh[ií]b\w*|exclu\w*|never|not|without|nor|neither)$", re.I)
RETRY_BOUNDARIES = {",", ";", ":", "(", ")", "—", "–", "y", "e", "pero", "aunque", "si", "cuando", "salvo", "excepto",
                    "solo", "sólo", "mientras", "sino", "and", "but", "if", "when", "unless", "except", "only", "while", "although"}
RETRY_NEGATION_WINDOW = 4


def _negated(tokens, index):
    """True when a negator precedes tokens[index] within the window, in the same clause."""
    for position in range(index - 1, max(-1, index - RETRY_NEGATION_WINDOW - 2), -1):
        word = tokens[position].lower()
        if RETRY_NEGATORS.match(word):
            return True
        if word in RETRY_BOUNDARIES:
            return False
    return False


def _clause(tokens, index):
    start = index
    while start > 0 and tokens[start - 1].lower() not in RETRY_BOUNDARIES:
        start -= 1
    end = index + 1
    while end < len(tokens) and tokens[end].lower() not in RETRY_BOUNDARIES:
        end += 1
    return start, end


def _is_label(tokens, index):
    word = tokens[index].lower()
    if word == "reintentos":
        before = [t.lower() for t in tokens[max(0, index - 2):index]]
        after = tokens[index + 1].lower() if index + 1 < len(tokens) else ""
        return before in (["política", "de"], ["politica", "de"]) or after == "futuros"
    return word == "retry" and index + 1 < len(tokens) and tokens[index + 1].lower() == "policy"


def _retry_mentions(tokens):
    lowered = [t.lower() for t in tokens]
    for index, word in enumerate(lowered):
        if RETRY_WORDS.match(word):
            yield index
        elif word == "volver" and lowered[index + 1:index + 2] == ["a"] and lowered[index + 2:index + 3] \
                and lowered[index + 2] in RETRY_AGAIN_VERBS:
            yield index
        elif word == "enviar" and lowered[index + 1:index + 3] == ["de", "nuevo"]:
            yield index


def retry_violations(text):
    """Return the sentences of `text` that allow, or do not clearly forbid, a retry/replay of a business request."""
    violations = []
    for sentence in re.split(r"(?<=[.;:])\s+|\n", text):
        if not RETRY_METHODS.search(sentence):
            continue
        tokens = re.findall(r"[\wáéíóúñü]+|[,;:()—–]", sentence.replace("`", " "))
        for index in _retry_mentions(tokens):
            if _is_label(tokens, index):
                start, end = _clause(tokens, index)
                ordered = [i for i in range(start, end)
                           if RETRY_ACTION_VERBS.match(tokens[i]) and not _negated(tokens, i)]
                if not ordered:
                    continue  # descriptive reference: nothing in its clause orders or runs a retry
            elif _negated(tokens, index):
                continue
            violations.append(sentence.strip())
            break
    return violations


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

    def test_google_exchange_cases_carry_coherent_preconditions(self):
        """Each Google exchange case must be reachable in the order Java checks things."""
        order = self.observed["javaCheckOrder"]
        self.assertEqual(7, len(order))
        markers = ["CSRF_INVALID", "load persisted attempt", "consumed", "expired", "browser-binding hash",
                   "Google proof", "resolve identity"]
        for position, marker in enumerate(markers):
            self.assertIn(marker, order[position], f"step {position + 1}")
        self.assertIn("different value", self.observed["attemptBindingHashRule"])
        self.assertIn("static-inspection", self.observed["evidence"])
        cases = [c for c in self.observed["cases"] if c["operationId"] == "exchangeGoogleCredential"]
        self.assertEqual(
            {"obs-google-exchange-200", "obs-google-csrf-invalid-403", "obs-google-unknown-identity-401",
             "obs-google-attempt-consumed-409", "obs-google-attempt-expired-410"},
            {c["id"] for c in cases})
        for case in cases:
            with self.subTest(case["id"]):
                pre = case["preconditions"]
                headers = case["request"]["headers"]
                body = case["request"]["body"]
                secret = pre["attemptCookieSecret"]
                self.assertRegex(secret, r"^[0-9a-f]{64}$")
                self.assertEqual("__Host-mtec-attempt=" + secret, headers["Cookie"])
                self.assertEqual("web", headers["X-MTEC-Client"])
                self.assertTrue(headers["Origin"].startswith("https://"))
                self.assertRegex(body["attemptId"], r"^[0-9a-f]{32}$")
                self.assertEqual(body["attemptId"], pre["persistedAttempt"]["attemptId"])
                expected_csrf = hashlib.sha256(("mtec-attempt-csrf:" + secret).encode("ascii")).hexdigest()
                expected_hash = hashlib.sha256(secret.encode("ascii")).hexdigest()
                self.assertEqual(expected_hash, pre["persistedAttempt"]["browserSecretHash"])
                self.assertNotEqual(expected_hash, expected_csrf)
                status = case["response"]["status"]
                if status == 403:
                    self.assertNotEqual(expected_csrf, headers.get("X-CSRF-Token"))
                    continue
                self.assertEqual(expected_csrf, headers["X-CSRF-Token"])
                attempt, now = pre["persistedAttempt"], pre["serverTime"]
                if status == 409:
                    self.assertTrue(attempt["consumed"])
                    self.assertEqual("consumed", attempt["state"])
                elif status == 410:
                    self.assertFalse(attempt["consumed"])
                    self.assertLessEqual(attempt["expiresAt"], now)
                    self.assertEqual("expired", attempt["state"])
                else:
                    self.assertFalse(attempt["consumed"])
                    self.assertGreater(attempt["expiresAt"], now)
                    self.assertEqual("pending", attempt["state"])
                    proof = pre["googleProof"]
                    for flag in ("verified", "nonceMatchesAttempt", "issuerAllowed", "audienceMatches",
                                 "emailVerified", "domainAllowed"):
                        self.assertIs(True, proof[flag], flag)
                    self.assertIs(status == 200, proof["identityLinkExists"])
                if status in (409, 410):
                    self.assertIsNone(pre["googleProof"])

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

    def test_matrix_security_matches_openapi_and_distinguishes_java_and_target(self):
        for row in self.matrix["operations"]:
            _, _, op = self.ops_by_id[row["operationId"]]
            self.assertEqual([sorted(r) for r in op.get("security", [])], row["openapiSecurity"], row["operationId"])
        for operation_id in ("getOwnUserProfile", "updateOwnUserProfile", "getUserProfile", "updateUserProfile",
                             "getOwnAuthMethods"):
            row = next(r for r in self.matrix["operations"] if r["operationId"] == operation_id)
            self.assertEqual([["apimSubscriptionKey", "bearerAuth"]], row["openapiSecurity"], operation_id)
            self.assertIn("internal JWT only", row["javaAuth"])
            self.assertNotIn("bearer or APIM", row["requestOpenapi"])
            self.assertIn("not alternatives", row["securityNote"])
            self.assertIn("MTEC-41", row["securityNote"])

    def test_link_route_is_gated_not_refusing_and_activity_is_the_only_refusal(self):
        states = {r["operationId"]: r["javaState"] for r in self.matrix["operations"]}
        self.assertEqual("gated", states["linkOwnAuthMethod"])
        self.assertEqual(["recordSessionActivity"], [k for k, v in states.items() if v == "gated-refuses"])

    def test_inventory_counts_and_editorial_note(self):
        ids = sorted(x["id"] for r in self.matrix["operations"] for x in r["divergences"])
        self.assertEqual([f"M-{n:02d}" for n in range(1, 35)], ids)
        self.assertEqual([f"A-{n:02d}" for n in range(1, 10)], sorted(x["id"] for x in self.matrix["angularDivergences"]))
        self.assertIn("not an exhaustive security-impact classification", self.matrix["legend"]["editorialNote"])
        self.assertIn("static inspection", self.matrix["legend"]["evidence"])
        self.assertIn("34 divergencias", MATRIX_DOC.read_text(encoding="utf-8"))

    def test_d07_approved_design_policy_keeps_single_post_and_never_chains_actions(self):
        """D-07 (approved 2026-11-07 as design policy): serialization, one POST per demand, reconcile-only GET."""
        section = self.proposed["criticalSection"]
        self.assertTrue({"bootstrap", "refresh", "apply-result-to-memory"} <= set(section["covers"]))
        self.assertIs(True, section["csrfObtainedInside"])
        self.assertEqual(1, section["maxRefreshPostsPerDemand"])
        self.assertEqual(1, section["maxRefreshInFlightPerTab"])
        self.assertIn("Web Locks", section["mutex"])
        self.assertIn("BroadcastChannel only for signals", section["mutex"])
        self.assertIs(False, section["shareCredentialsBetweenTabs"])
        self.assertEqual("secure-reauthentication", section["withoutGuaranteedMutualExclusion"]["action"])
        self.assertIn("not a rotation", section["sessionGet200Proves"])
        self.assertIn("marks the local session closed", section["logoutCoordination"])
        self.assertIn("never chain another POST", section["postFailureAction"])
        for name, flow in self.proposed["flows"].items():
            posts = [s for s in flow["steps"] if s.get("call") == "refreshSession"]
            self.assertLessEqual(len(posts), 1, f"{name} chains more than one refresh POST")
            if name in ("lostResponse", "loserTab"):
                self.assertEqual([], posts, f"{name} must only reconcile with GET /session")
                calls = [s["call"] for s in flow["steps"] if "call" in s]
                self.assertEqual(["getSessionState"], calls, name)
        # Bootstrap, CSRF and refresh share one critical section: GET /session precedes the single POST.
        calls = [s.get("call") for s in self.proposed["flows"]["scheduledRefresh"]["steps"] if s.get("call")]
        self.assertEqual(["getSessionState", "refreshSession"], calls)
        # A 200 from GET /session never authorizes an immediate second rotation.
        lost = self.proposed["flows"]["lostResponse"]["steps"][1]["onStatus"]["200"]
        self.assertIn("later new demand", lost)
        # Policy C (no grace) still decides the 401 case.
        self.assertIn("policy C", self.proposed["flows"]["lostResponse"]["steps"][1]["onStatus"]["401"])

    def test_d11_initial_policy_forbids_every_automatic_replay_after_401(self):
        """D-11 core (approved 2026-11-07): no automatic replay of GET or any mutation after a 401."""
        retry = self.proposed["retryPolicy"]
        self.assertIs(False, retry["genericReplayAllowed"])
        self.assertEqual({"GET", "POST", "PUT", "PATCH", "DELETE"}, set(retry["automaticReplayAfter401"]))
        self.assertTrue(all(v is False for v in retry["automaticReplayAfter401"].values()),
                        "no HTTP method may be replayed automatically after a 401")
        self.assertIs(False, retry["getRetry"]["allowed"])
        self.assertEqual(0, retry["getRetry"]["maxAttempts"])
        self.assertNotIn("requiresSamePrincipalAndSession", retry["getRetry"])
        self.assertIs(False, retry["retryAfterAuthorizesRefresh"])
        self.assertIn("PUT /v1/me/profile", retry["mutationsExcluded"])
        self.assertIn("PUT /v1/usuarios/{userId}", retry["mutationsExcluded"])
        self.assertEqual("pending-not-approved", retry["futurePerOperationRetries"])
        # The 401 flow of a business request issues no request of its own.
        steps = self.proposed["flows"]["businessCall401"]["steps"]
        self.assertEqual([], [s for s in steps if "call" in s], "a 401 must not trigger an automatic call")
        self.assertRegex(" ".join(s["action"] for s in steps), r"never replay")
        # No error-map entry may allow a retry; 401 entries carry no replay at all.
        for code, entry in self.proposed["errorMap"].items():
            self.assertNotIn(entry["retry"], (True, "once", "allowlist", "same-principal"), code)
            if 401 in entry["http"]:
                self.assertIn(entry["retry"], (False, "no-automatic-replay"), code)
        self.assertEqual("no-automatic-replay", self.proposed["errorMap"]["AUTH_REQUIRED"]["retry"])
        # The fixture must not keep any obsolete conditional GET-retry wording.
        text = json.dumps(self.proposed, ensure_ascii=False).lower()
        for phrase in ("explicit allowlist", "if approved", "retried once", "same principal and session"):
            self.assertNotIn(phrase, text, phrase)

    def test_decision_status_distinguishes_approved_scope_from_open_items(self):
        for status in (self.proposed["decisionStatus"], self.matrix["decisionStatus"]):
            self.assertEqual({"D-07", "D-11"}, set(status))
            self.assertEqual("design-policy-approved", status["D-07"]["status"])
            self.assertEqual("partially-approved", status["D-11"]["status"])
            self.assertEqual("2026-11-07", status["D-07"]["approvedOn"])
            self.assertEqual("2026-11-07", status["D-11"]["approvedOn"])
            self.assertIn("no automatic replay", status["D-11"]["approvedScope"])
        pending = " | ".join(self.proposed["decisionStatus"]["D-11"]["stillPending"]).lower()
        for item in ("error code catalog", "access_token_expired", "public dtos", "openapi semantics",
                     "per-operation retries"):
            self.assertIn(item, pending)
        # The open items are real: the catalog gap and the expiry signal still show in the contract/observations.
        self.assertIn("AUTH_REQUIRED", self.observed["javaErrorCodesNotInOpenapiEnum"])
        self.assertNotIn("AUTH_REQUIRED", self.error_enum)
        self.assertIn("ACCESS_TOKEN_EXPIRED", self.error_enum)
        self.assertIn("ACCESS_TOKEN_EXPIRED", self.observed["openapiErrorCodesNeverEmittedByJava"])
        self.assertIn("pending", self.proposed["errorMap"]["ACCESS_TOKEN_EXPIRED"]["note"])
        # Parsing and catalog proposals are not covered by the approval.
        self.assertEqual("proposed-pending-approval", self.proposed["angularErrorParsing"]["status"])
        self.assertEqual("error.error?.error?.code", self.proposed["angularErrorParsing"]["codePath"])
        # Approving a policy does not approve the whole flow or B07.
        self.assertIs(False, self.proposed["approved"])
        self.assertIs(False, self.matrix["b07Approved"])

    def test_approving_policies_does_not_close_divergences(self):
        by_id = {d["id"]: (r["operationId"], d) for r in self.matrix["operations"] for d in r["divergences"]}
        angular = {d["id"]: d for d in self.matrix["angularDivergences"]}
        for ident in ("M-13", "M-16", "M-19", "M-20"):
            self.assertIn(ident, by_id)
        self.assertEqual(34, len(by_id))
        self.assertEqual(9, len(angular))
        for ident in ("A-05", "A-07"):
            self.assertIn(ident, angular)
        # Summaries no longer claim D-07 lacks approval, and say the divergence remains open.
        for ident in ("M-13", "M-16"):
            summary = by_id[ident][1]["summary"]
            self.assertNotIn("not approved", summary)
            self.assertNotIn("recommendation only", summary)
            self.assertIn("2026-11-07", summary)
            self.assertRegex(summary, r"pending|stays open")
        # D-11 stays only partially resolved in the divergences that concern the catalog.
        for ident in ("M-19", "M-20"):
            self.assertIn("pending", by_id[ident][1]["summary"])
            self.assertEqual("D-11", by_id[ident][1]["decision"])
        self.assertIn("pending", angular["A-07"]["summary"])
        self.assertIn("pending", angular["A-05"]["summary"])
        # The generated Markdown carries the same text as its JSON source.
        doc = MATRIX_DOC.read_text(encoding="utf-8")
        for ident, summary in [(i, by_id[i][1]["summary"]) for i in ("M-13", "M-16", "M-19", "M-20")] + \
                [(i, angular[i]["summary"]) for i in ("A-05", "A-07")]:
            self.assertIn(summary, doc, f"{ident} differs between the JSON source and the Markdown")
        self.assertIn("aprobada parcialmente", doc)
        self.assertNotRegex(doc, r"(?i)D-07[^.\n]{0,80}no (est[aá] )?aprobad")
        self.assertNotIn("Tab protocol is not approved", doc)
        self.assertNotIn("Protocol is a recommendation only", doc)

    def test_regression_a_web_locks_is_the_approved_mutex_and_rotation_requires_it(self):
        """Web Locks must not slip back to an optional candidate (D-07 approved 2026-11-07)."""
        section = self.proposed["criticalSection"]
        self.assertEqual("web-locks", section["approvedMechanism"])
        self.assertIs(True, section["mutualExclusionRequiredBeforeRotation"])
        self.assertNotRegex(section["mutex"], r"(?i)candidate|optional|if available|preferred|when supported")
        fallback = section["withoutGuaranteedMutualExclusion"]
        self.assertEqual("secure-reauthentication", fallback["action"])
        self.assertEqual(0, fallback["refreshPostsAllowed"])
        self.assertIs(False, fallback["automaticRotationAllowed"])
        self.assertIs(False, fallback["broadcastChannelSubstitutesMutex"])
        # Every flow that rotates the refresh cookie is gated on the lock, and its POST follows GET /session.
        rotating = [name for name, flow in self.proposed["flows"].items()
                    if any(step.get("call") == "refreshSession" for step in flow["steps"])]
        self.assertEqual({"reload", "scheduledRefresh"}, set(rotating))
        for name in rotating:
            flow = self.proposed["flows"][name]
            self.assertEqual("web-locks-lock-acquired", flow["requires"], name)
            calls = [step["call"] for step in flow["steps"] if "call" in step]
            self.assertEqual(["getSessionState", "refreshSession"], calls, name)
        self.assertIn("secure reauthentication", self.proposed["flows"]["reload"]["withoutMutualExclusion"])
        self.assertIn("not a substitute", self.proposed["flows"]["reload"]["withoutMutualExclusion"])
        # An unauthenticated GET /session never leads to a refresh POST.
        reload_steps = self.proposed["flows"]["reload"]["steps"]
        session_step = next(s for s in reload_steps if s.get("call") == "getSessionState")
        self.assertIn("no refresh POST", session_step["onStatus"]["401"])

    def test_regression_b_no_http_method_is_replayed_after_401_anywhere_in_the_fixture(self):
        """GET, POST, PUT, PATCH and DELETE are all excluded; checked structurally across the whole fixture."""
        replay = self.proposed["retryPolicy"]["automaticReplayAfter401"]
        for method in ("GET", "POST", "PUT", "PATCH", "DELETE"):
            self.assertIs(False, replay[method], method)
        allowed_words = re.compile(r"^(no-|pending-not-approved$|manual$|after-user-or-new-demand$)")
        risky_words = re.compile(r"(?i)\b(once|allowlist|auto(matic)?|same-principal|replay)")

        def walk(node, path):
            if isinstance(node, dict):
                for key, value in node.items():
                    if re.search(r"(?i)retry|replay", key) and key not in ("retryPolicy", "retryAfterAuthorizesRefresh",
                                                                           "automaticReplayAfter401", "genericReplayAllowed",
                                                                           "futurePerOperationRetries"):
                        if value is True:
                            self.fail(f"{path}/{key} enables a retry")
                        if isinstance(value, str) and risky_words.search(value) and not allowed_words.match(value):
                            self.fail(f"{path}/{key} allows a retry: {value!r}")
                    if key in ("allowed", "automaticReplay", "replayAllowed") and value is True:
                        self.fail(f"{path}/{key} is true")
                    walk(value, f"{path}/{key}")
            elif isinstance(node, list):
                for index, item in enumerate(node):
                    walk(item, f"{path}[{index}]")
        walk(self.proposed, "")
        self.assertIs(False, self.proposed["retryPolicy"]["getRetry"]["allowed"])
        # A free-text step may only mention a method together with a negation.
        for step in self.proposed["flows"]["businessCall401"]["steps"]:
            self.assertEqual([], retry_violations(step.get("action", "")))

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


class B07RegressionTextTest(unittest.TestCase):
    """Text guards for the approved D-07 / D-11 scope in the plan and the proposed flow."""

    @classmethod
    def setUpClass(cls):
        cls.plan = PLAN_DOC.read_text(encoding="utf-8")
        cls.flow = load(PROPOSED_PATH)

    def test_plan_does_not_prescribe_any_retry_after_401(self):
        banned = [r"un reintento tras 401", r"reintent\w+ (autom[aá]tic\w+ )?(de )?(cualquier|toda)s? (petici[oó]n|solicitud)",
                  r"se rota una vez", r"repetir (autom[aá]ticamente )?(la petici[oó]n|cualquier)",
                  r"reintento de un `?GET", r"GET`? expresamente permitido", r"mismo principal y (la )?sesi[oó]n"]
        for pattern in banned:
            self.assertNotRegex(self.plan, re.compile(pattern, re.I), pattern)
        # Sentence level, every method: each retry word must be negated in its own clause (see retry_violations).
        self.assertEqual([], retry_violations(self.plan))

    def test_regression_b_plan_forbids_delete_and_patch_replay_like_every_other_method(self):
        section = self.plan.split("## 8. Errores del servidor en Angular")[1].split("## 9.")[0]
        self.assertRegex(section, r"(?i)ninguna petici[oó]n de negocio se reintenta autom[aá]ticamente tras un `401`")
        self.assertRegex(section, r"(?i)ni los `GET` ni ninguna mutaci[oó]n")
        self.assertEqual([], retry_violations(section))
        criteria = self.plan.split("## 11. Criterios de aceptaci")[1].split("## 12.")[0]
        item9 = criteria.split("9. **AT-PROFILE-2")[1].split("10. **")[0]
        self.assertRegex(item9, r"(?i)ninguna petici[oó]n")
        self.assertIn("el mock recibe una sola solicitud", item9)

    ALLOWED = [
        "Tras 401, el interceptor no reintenta GET automáticamente.",
        "Tras 401, no se permite reintentar POST.",
        "Un 401 AUTH_REQUIRED no provoca repetición automática de peticiones de negocio.",
        "Ninguna petición de negocio se reintenta automáticamente tras un 401, ni GET ni DELETE.",
        "Nunca se repite DELETE tras un 401.",
        "PATCH y DELETE no se reintentan tras un 401.",
        "Angular maneja el error sin repetir POST ni PUT silenciosamente.",
        "DELETE se excluye de todo reintento automático.",
        "La petición de negocio original no se reenvía, sea GET o mutación.",
        "The interceptor never retries any GET or mutation after a 401.",
        # Descriptive references to the policy are fine while nothing in their clause orders a retry.
        "Política de reintentos aprobada para peticiones de negocio (GET y mutaciones).",
        "Los reintentos futuros de GET requieren aprobación adicional.",
        "No se aprueban por implicación los reintentos futuros por operación (GET, POST, PUT, PATCH, DELETE).",
        "La política de reintentos no ordena volver a enviar GET automáticamente.",
        "Tras 401, la política de reintentos prohíbe ejecutar reintentos de GET.",
        "Tras 401, no se debe volver a enviar ninguna petición de negocio.",
        "Tras 401, el interceptor no ejecuta los reintentos futuros de GET.",
    ]
    FORBIDDEN_PHRASES = [
        # The exact regression found by the differential audit: the "no" belongs to "errores de red".
        "Tras 401, el interceptor reintenta GET automáticamente si no hay errores de red.",
        "Tras 401, el interceptor reintenta POST automáticamente cuando el servidor no responde.",
        "Un POST se reintenta una vez si la sesión no ha cambiado.",
        "Tras 401, el interceptor repite DELETE automáticamente.",
        "Se permite reintentar PATCH solo cuando no existe una condición externa.",
        "Tras 401, no se muestra el error y el interceptor reintenta POST.",
        "No hay errores de red; el interceptor reintenta GET tras 401.",
        "Tras 401 no se bloquea nada, pero el interceptor repite la petición de negocio.",
        "El interceptor no reintenta GET, pero sí reintenta POST.",
        "No se reintenta PUT, y se reintenta DELETE.",
        "After a 401 the interceptor retries GET automatically unless there is no network error.",
        # Escapes of the label exemption, reported by the second differential audit.
        "Tras 401, la política de reintentos ordena volver a enviar GET automáticamente.",
        "Tras 401, el interceptor ejecuta automáticamente los reintentos futuros de GET.",
        # Indirect instructions.
        "Tras 401, el cliente debe ordenar volver a enviar POST automáticamente.",
        "Tras 401 se debe autorizar reenviar DELETE.",
        "Tras 401 se debe habilitar el replay de PATCH.",
        "Tras 401, el interceptor ejecuta automáticamente los reintentos de PUT.",
        "Se puede permitir repetir GET tras un 401.",
        "Tras 401, la política de reintentos autoriza GET automático y los reintentos futuros se ejecutan sin aprobación.",
    ]

    def test_retry_negation_check_accepts_prohibitions_and_rejects_permissions(self):
        for sentence in self.ALLOWED:
            with self.subTest(allowed=sentence):
                self.assertEqual([], retry_violations(sentence))
        for sentence in self.FORBIDDEN_PHRASES:
            with self.subTest(forbidden=sentence):
                found = retry_violations(sentence)
                self.assertTrue(found, "the phrase allows a retry and must be reported")
                self.assertTrue(all(clause in sentence for clause in found))

    def test_regression_b_plan_check_fails_when_a_conditional_retry_is_injected(self):
        """The audit's sentence, placed in section 8 of the real plan, must now be reported."""
        self.assertEqual([], retry_violations(self.plan))
        anchor = "- `Retry-After` (p. ej. en 429)"
        self.assertEqual(1, self.plan.count(anchor))
        for sentence in self.FORBIDDEN_PHRASES:
            with self.subTest(sentence):
                mutated = self.plan.replace(anchor, f"- {sentence}\n{anchor}")
                found = retry_violations(mutated)
                self.assertTrue(found, "the injected sentence must be reported")
                self.assertTrue(all(clause.lstrip("- ") in sentence for clause in found),
                                "only the injected sentence may be reported")
        for sentence in self.ALLOWED:
            with self.subTest(sentence):
                self.assertEqual([], retry_violations(self.plan.replace(anchor, f"- {sentence}\n{anchor}")))

    def test_regression_a_plan_makes_web_locks_mandatory_before_rotating(self):
        self.assertNotRegex(self.plan, r"(?i)(candidato|opcional|si est[aá] disponible)[^.\n]{0,40}Web Locks"
                                       r"|Web Locks[^.\n]{0,40}(candidato|opcional|si est[aá] disponible)")
        section6 = self.plan.split("## 6. Dos pestañas")[1].split("## 7.")[0]
        self.assertIn("Exclusión mutua entre pestañas con Web Locks", section6)
        self.assertRegex(section6, r"Sin exclusi[oó]n mutua garantizada.*reautenticaci[oó]n.*no env[ií]a el POST de refresh")
        section5 = self.plan.split("## 5. Recuperar la sesi")[1].split("## 6.")[0]
        self.assertRegex(section5, r"Solo si hay Web Locks y se adquiere el lock")
        self.assertRegex(section5, r"Sin Web Locks ni exclusi[oó]n mutua equivalente demostrada, no se ejecuta ni el POST")

    def test_reload_criterion_distinguishes_three_scenarios(self):
        criteria = self.plan.split("## 11. Criterios de aceptaci")[1].split("## 12.")[0]
        item5 = criteria.split("5. **AT-SESSION-1/2 y recarga")[1].split("6. **AT-REFRESH")[0]
        parts = re.split(r"- \*\*Escenario ", item5)
        self.assertEqual(4, len(parts), "expected the preamble plus scenarios A, B and C")
        a, b, c = parts[1], parts[2], parts[3]
        self.assertTrue(a.startswith("A"), a[:20])
        self.assertTrue(b.startswith("B"), b[:20])
        self.assertTrue(c.startswith("C"), c[:20])
        # A: lock acquired -> GET /session inside the lock, at most one POST, result applied before release.
        self.assertIn("Web Locks disponible y lock adquirido", a)
        self.assertRegex(a, r"`GET /v1/auth/session`.*CSRF vigente dentro del lock")
        self.assertIn("como máximo un `POST /v1/auth/refresh` por demanda", a)
        self.assertRegex(a, r"aplica el resultado a la memoria antes de liberar el lock")
        self.assertRegex(a, r"logout")
        self.assertRegex(a, r"no es una rotación ni entrega un access JWT")
        # B: no mutual exclusion -> no rotation, no POST, secure reauthentication, BroadcastChannel is no mutex.
        self.assertIn("no se emite `POST /v1/auth/refresh`", b)
        self.assertIn("No se intenta rotación automática", b)
        self.assertRegex(b, r"reautenticaci[oó]n segura")
        self.assertRegex(b, r"`BroadcastChannel` no sustituye al mutex")
        # C: no valid session -> no POST, reauthenticate.
        self.assertIn("No se emite `POST /v1/auth/refresh`", c)
        self.assertRegex(c, r"solicita reautenticaci[oó]n")
        # Policy C remains: no grace and no second automatic POST after an error.
        self.assertRegex(item5, r"pol[ií]tica C: sin gracia y sin segundo POST autom[aá]tico")
        # The old unconditional wording must be gone.
        self.assertNotIn("restaura sesión con una llamada a `/session` y una a `/refresh`", self.plan)

    def test_decision_log_and_register_keep_d07_and_d11_responsibilities_apart(self):
        log = " ".join((ROOT / "context/decisions/DECISION_LOG.md").read_text(encoding="utf-8").split())
        self.assertNotIn("protocolo final, pruebas y conformidades siguen pendientes", log)
        self.assertIn("La política de diseño D-07 (refresh entre pestañas y respuesta perdida) se aprobó el 2026-11-07", log)
        self.assertIn("siguen pendientes su implementación, pruebas, compatibilidad de navegadores y conformidades técnicas", log)
        register = REGISTER_DOC.read_text(encoding="utf-8")
        d07 = register.split("### D-07 ")[1].split("### D-08")[0]
        d07_items = d07.split("- **Pendiente:**")[0]
        self.assertNotRegex(d07_items, r"(?i)reintent")
        pending = d07.split("- **Pendiente:**")[1]
        for sentence in re.split(r"(?<=[.;])\s+", " ".join(pending.split())):
            if re.search(r"(?i)reintent", sentence):
                self.assertIn("D-11", sentence, sentence)
                self.assertRegex(sentence, r"(?i)no pertenece a D-07")
        d11 = register.split("### D-11 ")[1].split("### D-12")[0]
        self.assertRegex(d11, r"política inicial de reintentos APROBADA")
        for open_item in ("ACCESS_TOKEN_EXPIRED", "DTO públicos", "semántica OpenAPI"):
            self.assertIn(open_item, d11.split("- **Pendiente:**")[1])

    def test_plan_separates_approved_policy_from_pending_work(self):
        header = self.plan.split("**Alcance:**")[0]
        self.assertIn("Política aprobada", header)
        self.assertIn("Implementación pendiente", header)
        self.assertIn("Contrato pendiente", header)
        self.assertIn("ni el flujo completo ni B07 están aprobados", header)
        self.assertIn("incluidos los `GET` y todas las mutaciones", header)
        for pending in ("catálogo de errores", "`ACCESS_TOKEN_EXPIRED`", "DTO públicos"):
            self.assertIn(pending, header)
        self.assertNotIn("siguen pendientes de aprobación", header)
        self.assertIn("Web Locks", self.plan)
        self.assertIn("reautenticación", self.plan)
        self.assertIn("error.error?.error?.code", self.plan)
        self.assertIn("PENDIENTE", self.plan)

    def test_session_200_is_not_evidence_of_a_won_rotation(self):
        text = json.dumps(self.flow["flows"]["loserTab"], ensure_ascii=False).lower()
        for phrase in ("another tab won", "won the rotation", "otra pestaña ganó", "rotation succeeded"):
            self.assertNotIn(phrase, text)
        ok = self.flow["flows"]["loserTab"]["steps"][1]["onStatus"]["200"]
        self.assertIn("does not show that another tab refreshed", ok)
        self.assertIn("Do not chain another refresh POST", ok)
        self.assertEqual([], [s for s in self.flow["flows"]["loserTab"]["steps"] if s.get("call") == "refreshSession"])
