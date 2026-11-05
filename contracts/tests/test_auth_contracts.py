"""MTEC-15 draft shape/regression checks; these do not test a running authenticator."""
from __future__ import annotations

import copy
import hashlib
import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from test_contracts import media_examples, resolve_ref, walk_refs


ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "contracts"
API_PATH = CONTRACTS / "openapi/users.json"
FIXTURES = CONTRACTS / "examples/auth"
HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def fingerprint(value):
    data = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(data).hexdigest()


def validator(api, schema):
    return Draft202012Validator(
        {"$ref": "#/components/schemas/" + schema, "components": api["components"]},
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def validate_session(snapshot):
    """Test oracle for documented inequalities; not a state store or JWT verifier."""
    a, r, h, now = (snapshot[name] for name in (
        "authenticatedAt", "renewedAt", "lastActivityAt", "serverTime"
    ))
    absolute = a + 28800
    assert a <= r <= now and a <= h <= now, "server chronology"
    assert snapshot["absoluteExpiresAt"] == absolute, "absolute origin changed"
    assert snapshot["windowExpiresAt"] == min(r + 3600, absolute), "window"
    assert snapshot["inactivityExpiresAt"] == min(h + 1800, absolute), "inactivity"
    deadline = min(snapshot[name] for name in (
        "windowExpiresAt", "inactivityExpiresAt", "absoluteExpiresAt"
    ))
    assert snapshot["expiresAt"] == deadline, "first applicable limit"
    assert snapshot["status"] == "active" and now < deadline, "success is expired"
    assert a <= snapshot["warningAt"] < deadline, "warning must precede expiry"


def validate_auth(value):
    validate_session(value["session"])
    assert value["session"]["serverTime"] < value["expiresAt"] <= value["session"]["expiresAt"], "access beyond session"
    assert value["expiresAt"] - value["session"]["serverTime"] <= 240, "access lifetime exceeds 240"


def validate_semantics(schema, value):
    if schema == "AuthResponse":
        validate_auth(value)
    elif schema == "SessionSnapshot":
        validate_session(value)
    elif schema == "SessionResponse":
        validate_session(value["session"])


class AuthContractsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = load(API_PATH)
        cls.cases = load(FIXTURES / "schema-cases.json")

    def operations(self):
        for route, path in self.api["paths"].items():
            for method, operation in path.items():
                if method in HTTP_METHODS:
                    yield route, method, operation

    def test_required_operations_exist_and_remain_proposed(self):
        required = {
            ("/v1/auth/attempts", "post"), ("/v1/auth/google", "post"),
            ("/v1/auth/google/registrations", "post"),
            ("/v1/auth/email/requests", "post"), ("/v1/auth/email/confirm", "post"),
            ("/v1/auth/session", "get"), ("/v1/auth/refresh", "post"),
            ("/v1/auth/logout", "post"), ("/v1/auth/session/activity", "post"),
            ("/v1/auth/proofs/attempts", "post"), ("/v1/auth/proofs/google", "post"),
            ("/v1/auth/proofs/email/requests", "post"), ("/v1/auth/proofs/email/confirm", "post"),
            ("/v1/me/auth-methods", "get"), ("/v1/me/auth-methods", "post"),
            ("/v1/me/profile", "get"), ("/v1/me/profile", "put"),
            ("/v1/usuarios/{userId}", "get"), ("/v1/usuarios/{userId}", "put"),
            ("/.well-known/jwks.json", "get"), ("/.well-known/markettec-identity", "get"),
        }
        actual = {(route, method) for route, method, _ in self.operations()}
        self.assertEqual(required | {("/health", "get")}, actual)
        for route, method in required:
            self.assertEqual("proposed", self.api["paths"][route][method]["x-implementation-status"])
        self.assertEqual("draft-pending-team-approval", self.api["x-contract-status"])
        self.assertEqual("0.3.0-draft", self.api["info"]["version"])
        self.assertGreaterEqual(len(self.api["x-design-review"]["breakingChanges"]), 3)

    def test_login_refresh_and_metadata_have_no_bearer_bootstrap_cycle(self):
        for route, _, op in self.operations():
            if op.get("x-route-class") in {"pre-session", "attempt-proof", "session-cookie", "public-metadata"}:
                self.assertTrue(all("bearerAuth" not in option for option in op["security"]), route)
            if op.get("x-route-class") == "public-metadata":
                self.assertEqual([], op["security"])

    def test_sensitive_proofs_require_bearer_cookie_and_csrf_together(self):
        for route, _, op in self.operations():
            if op.get("x-route-class") == "authenticated-session":
                self.assertEqual(1, len(op["security"]), route)
                self.assertEqual({"bearerAuth", "refreshCookie", "apimSubscriptionKey"}, set(op["security"][0]), route)
                self.assertIn({"$ref": "#/components/parameters/CsrfToken"}, op["parameters"])

    def test_all_schema_components_are_formal_draft_2020_12(self):
        self.assertEqual("https://json-schema.org/draft/2020-12/schema", self.api["jsonSchemaDialect"])
        for name, schema in self.api["components"]["schemas"].items():
            with self.subTest(schema=name):
                Draft202012Validator.check_schema(schema)

    def test_auth_fixtures_with_formal_and_cross_field_validation(self):
        for case in self.cases:
            with self.subTest(case=case["name"]):
                errors = list(validator(self.api, case["schema"]).iter_errors(case["value"]))
                valid = not errors
                if valid:
                    try:
                        validate_semantics(case["schema"], case["value"])
                    except AssertionError:
                        valid = False
                self.assertEqual(case["valid"], valid, case["name"])

    def test_every_openapi_example_uses_full_json_schema_validation(self):
        checked = 0
        for _, _, op in self.operations():
            messages = list(op["responses"].values())
            if "requestBody" in op:
                messages.append(op["requestBody"])
            for message in messages:
                if "$ref" in message:
                    message, _, _ = resolve_ref(message["$ref"], self.api, API_PATH)
                for media in message.get("content", {}).values():
                    for value in media_examples(media):
                        Draft202012Validator(
                            {**media["schema"], "components": self.api["components"]},
                            format_checker=Draft202012Validator.FORMAT_CHECKER,
                        ).validate(value)
                        schema_ref = media["schema"].get("$ref", "")
                        validate_semantics(schema_ref.rsplit("/", 1)[-1], value)
                        checked += 1
        self.assertGreater(checked, 50)
        positive_by_schema = {}
        for case in self.cases:
            if case["valid"]:
                positive_by_schema.setdefault(case["schema"], []).append(case["value"])
        for _, _, op in self.operations():
            for status, response in op["responses"].items():
                if not status.startswith("2"):
                    continue
                for media in response.get("content", {}).values():
                    name = media["schema"]["$ref"].rsplit("/", 1)[-1]
                    positive_by_schema.setdefault(name, []).extend(media_examples(media))
        for route, method, op in self.operations():
            for status, response in op["responses"].items():
                if not status.startswith("2"):
                    continue
                for media in response.get("content", {}).values():
                    name = media["schema"]["$ref"].rsplit("/", 1)[-1]
                    with self.subTest(route=route, method=method, status=status):
                        self.assertTrue(positive_by_schema.get(name), "success schema has no positive case: " + name)
                        for value in positive_by_schema[name]:
                            Draft202012Validator(
                                {**media["schema"], "components": self.api["components"]},
                                format_checker=Draft202012Validator.FORMAT_CHECKER,
                            ).validate(value)
                            validate_semantics(name, value)

    def test_every_error_keeps_complete_envelope_correlation_and_cache_policy(self):
        for route, _, op in self.operations():
            if route == "/health":
                continue
            for code, response in op["responses"].items():
                if not code.startswith(("4", "5")):
                    continue
                if "$ref" in response:
                    response, _, _ = resolve_ref(response["$ref"], self.api, API_PATH)
                self.assertIn("X-Correlation-ID", response["headers"], route)
                self.assertIn("Cache-Control", response["headers"], route)
                schema = response["content"]["application/json"]["schema"]
                incomplete = {"error": {"code": "UNAUTHORIZED", "message": "error"}}
                check = Draft202012Validator({**schema, "components": self.api["components"]})
                self.assertFalse(check.is_valid(incomplete), route)
                if code == "429": self.assertIn("Retry-After", response["headers"])
                if code == "401": self.assertIn("WWW-Authenticate", response["headers"])

    def test_error_status_codes_and_private_details_are_enforced(self):
        all_codes = self.api["components"]["schemas"]["AuthErrorEnvelope"]["allOf"][1]["properties"]["error"]["properties"]["code"]["enum"]
        for route, method, op in self.operations():
            if route == "/health":
                continue
            for status, allowed in op["x-error-codes"].items():
                with self.subTest(route=route, method=method, status=status):
                    response = op["responses"][status]
                    if "$ref" in response:
                        response, _, _ = resolve_ref(response["$ref"], self.api, API_PATH)
                    schema = response["content"]["application/json"]["schema"]
                    check = Draft202012Validator({**schema, "components": self.api["components"]})
                    value = {"error": {"code": allowed[0], "message": "Error",
                                       "details": [], "correlationId": "qa", "timestamp": 1790000000}}
                    for code in all_codes:
                        value["error"]["code"] = code
                        self.assertEqual(code in allowed, check.is_valid(value), code)
                    value["error"]["code"] = allowed[0]
                    value["error"]["details"] = ["otra-cuenta@tec.ac.cr"]
                    self.assertFalse(check.is_valid(value), "private details")

    def test_profile_aliases_have_same_update_failures_and_browser_controls(self):
        legacy = self.api["paths"]["/v1/usuarios/{userId}"]["put"]
        own = self.api["paths"]["/v1/me/profile"]["put"]
        self.assertEqual(set(own["responses"]), set(legacy["responses"]))
        for name in ("Origin", "WebClient"):
            self.assertIn({"$ref": "#/components/parameters/" + name}, legacy["parameters"])
        for method in ("get", "put"):
            response = self.api["paths"]["/v1/usuarios/{userId}"][method]["responses"]["404"]
            response, _, _ = resolve_ref(response["$ref"], self.api, API_PATH)
            self.assertEqual(self.api["components"]["responses"]["Auth404"]["content"]["application/json"]["schema"],
                             response["content"]["application/json"]["schema"])

    def test_session_success_shapes_reject_each_deadline_and_expired_access(self):
        auth = next(c["value"] for c in self.cases if c["name"] == "google-login")
        origin = auth["session"]["authenticatedAt"]
        for renewed, activity, limit in ((0, 0, 1800), (0, 3500, 3600), (28000, 28700, 28800)):
            for offset in (-1, 0, 1):
                snapshot = copy.deepcopy(auth["session"])
                snapshot.update(renewedAt=origin + renewed, lastActivityAt=origin + activity,
                                serverTime=origin + limit + offset,
                                windowExpiresAt=origin + min(renewed + 3600, 28800),
                                inactivityExpiresAt=origin + min(activity + 1800, 28800),
                                expiresAt=origin + limit, warningAt=origin + limit - 1)
                for schema, value in (
                    ("SessionSnapshot", snapshot),
                    ("SessionResponse", {"session": snapshot, "user": auth["user"], "csrfToken": "qa"}),
                    ("AuthResponse", {**auth, "session": snapshot, "expiresAt": origin + limit}),
                ):
                    with self.subTest(schema=schema, limit=limit, offset=offset):
                        validator(self.api, schema).validate(value)
                        if offset < 0:
                            validate_semantics(schema, value)
                        else:
                            with self.assertRaises(AssertionError):
                                validate_semantics(schema, value)
        expired_access = copy.deepcopy(auth)
        expired_access["expiresAt"] = expired_access["session"]["serverTime"]
        with self.assertRaises(AssertionError):
            validate_auth(expired_access)

    def test_session_errors_and_public_refresh_error_are_declared(self):
        session_codes = self.api["paths"]["/v1/auth/session"]["get"]["x-error-codes"]["401"]
        self.assertTrue({"SESSION_EXPIRED", "SESSION_REVOKED"}.issubset(session_codes))
        self.assertEqual(["REFRESH_INVALID"], self.api["paths"]["/v1/auth/refresh"]["post"]["x-error-codes"]["401"])

    def test_mail_proof_is_only_consumed_by_post_not_preview_get(self):
        for route in ("/v1/auth/email/confirm", "/v1/auth/proofs/email/confirm"):
            self.assertEqual({"post"}, set(self.api["paths"][route]))
        for route in ("/v1/auth/email/requests", "/v1/auth/proofs/email/requests"):
            codes = self.api["paths"][route]["post"]["x-error-codes"]
            self.assertNotIn("ELIGIBILITY_DENIED", codes["403"])
            self.assertEqual(["ATTEMPT_CONSUMED"], codes["409"])
        schema = self.api["components"]["schemas"]["EmailAccepted"]
        self.assertEqual({"status", "message"}, set(schema["properties"]))
        self.assertIn("const", schema["properties"]["message"])

    def test_google_registration_returns_auth_response_without_mailbox_step(self):
        policy = self.api["x-registration-policy"]
        self.assertFalse(policy["newGoogleRegistrationRequiresInstitutionalLink"])
        self.assertTrue(policy["googleEmailVerifiedAloneSufficient"])
        self.assertEqual({"estudiantec.cr", "itcr.ac.cr", "tec.ac.cr"}, set(policy["eligibleDomainsExact"]))
        for route in ("/v1/auth/google", "/v1/auth/google/registrations"):
            op = self.api["paths"][route]["post"]
            self.assertIn("200", op["responses"])
            self.assertNotIn("202", op["responses"])
            self.assertEqual("#/components/schemas/AuthResponse",
                             op["responses"]["200"]["content"]["application/json"]["schema"]["$ref"])
            self.assertEqual("not-required-for-google", op["x-registration-flow"]["mailboxProof"])
        self.assertFalse(self.api["paths"]["/v1/auth/google/registrations"]["post"]["deprecated"])
        self.assertFalse(self.api["x-identity-policy"]["automaticMergeByEmail"])

    def test_email_magic_link_remains_independent_and_unavailable(self):
        for route in ("/v1/auth/email/requests", "/v1/auth/email/confirm"):
            op = self.api["paths"][route]["post"]
            self.assertEqual({"503"}, set(op["responses"]))
            self.assertEqual(["AUTH_TEMPORARILY_UNAVAILABLE"], op["x-error-codes"]["503"])
            self.assertIn("independent-email-authentication-only", op["x-registration-flow"])

    def test_google_and_email_use_same_internal_user_shape(self):
        logins = [case["value"] for case in self.cases if case["name"] in {"google-login", "email-login-same-internal-user"}]
        self.assertEqual(2, len(logins))
        self.assertEqual(logins[0]["user"], logins[1]["user"])
        schema = self.api["components"]["schemas"]["AuthenticatedUser"]
        self.assertNotIn("sub", schema["properties"])
        self.assertFalse(schema["additionalProperties"])

    def test_identity_is_contextual_not_inferred_from_id_format(self):
        schema = self.api["components"]["schemas"]["UserId"]
        self.assertNotIn("pattern", schema)
        for opaque_id in ("a", "me", "not-a-uuid", "123456789", "A" * 64):
            validator(self.api, "UserId").validate(opaque_id)
        claims = next(c["value"] for c in self.cases if c["name"] == "internal-claims")
        trusted_internal_user = next(c["value"]["user"]["userId"] for c in self.cases if c["name"] == "google-login")
        self.assertEqual(trusted_internal_user, claims["sub"])
        swapped = {**claims, "sub": "external-google-sub-placeholder"}
        # Shape cannot distinguish opaque namespaces: trusted issuer/mapping is mandatory.
        self.assertTrue(validator(self.api, "InternalAccessClaims").is_valid(swapped))
        self.assertNotEqual(trusted_internal_user, swapped["sub"])
        self.assertNotIn("/v1/usuarios/me", self.api["paths"])

    def test_session_boundary_vectors_never_allow_expired_renewal(self):
        policy = self.api["x-session-policy"]
        self.assertEqual((3600, 1800, 28800), tuple(policy[k] for k in (
            "renewableWindowSeconds", "inactivityTimeoutSeconds", "absoluteLifetimeSeconds"
        )))
        vectors = load(FIXTURES / "session-policy-cases.json")
        for v in vectors:
            with self.subTest(case=v["name"]):
                deadline = min(v["renewedAt"] + 3600, v["lastActivityAt"] + 1800, v["authenticatedAt"] + 28800)
                self.assertLessEqual(v["authenticatedAt"], v["renewedAt"])
                self.assertLessEqual(v["renewedAt"], v["now"])
                self.assertLessEqual(v["authenticatedAt"], v["lastActivityAt"])
                self.assertLessEqual(v["lastActivityAt"], v["now"])
                self.assertEqual(v["deadline"], deadline)
                self.assertEqual(v["active"], not v.get("revoked", False) and v["now"] < deadline)
        for limit in (1800, 3600, 28800):
            for offset in (-1, 0, 1):
                self.assertTrue(any(v["deadline"] == limit and v["now"] == limit + offset
                                    for v in vectors), (limit, offset))
        self.assertFalse(policy["backgroundPollingIsActivity"])
        self.assertFalse(policy["refreshResetsAbsoluteLifetime"])
        self.assertEqual("unresolved-B01", policy["enforcementStrategy"])

    def test_valid_schema_can_still_have_invalid_session_semantics(self):
        for case in self.cases:
            if case.get("semantic"):
                self.assertTrue(validator(self.api, case["schema"]).is_valid(case["value"]), case["name"])
                with self.assertRaises(AssertionError):
                    (validate_auth if case["semantic"] == "auth" else validate_session)(case["value"])

    def test_refresh_concurrency_policy_is_explicit_and_not_idempotent_reissuance(self):
        rotation = self.api["paths"]["/v1/auth/refresh"]["post"]["x-refresh-rotation"]
        self.assertEqual("approved-policy-draft-protocol-and-tests-pending", rotation["status"])
        self.assertTrue(rotation["serializedAcrossTabs"])
        self.assertEqual("pending", rotation["protocolAndConcurrencyTests"])
        self.assertTrue(rotation["atomicConsumeAndReplace"])
        self.assertFalse(rotation["graceWindow"])
        self.assertFalse(rotation["reissueOnRetry"])
        self.assertEqual("reject-and-audit-without-automatic-winner-revocation", rotation["consumedGenerationReuse"])
        self.assertFalse(rotation["winnerRevokedOnIsolatedReplay"])
        self.assertEqual("confirmed-only-when-refresh-and-csrf-match", rotation["historicalPairClassification"])
        self.assertEqual("invalid-proof-not-confirmed-replay", rotation["unknownGenerationOrWrongCsrf"])
        self.assertEqual("401 REFRESH_INVALID", rotation["publicError"])
        self.assertEqual("REFRESH_INVALID", rotation["publicErrorExample"]["error"]["code"])
        self.assertEqual([], rotation["publicErrorExample"]["error"]["details"])
        public_error = self.api["paths"]["/v1/auth/refresh"]["post"]["responses"]["401"]
        self.assertNotIn("Set-Cookie", public_error["headers"])
        self.assertNotIn("token", json.dumps(public_error["content"]["application/json"]["examples"]))
        self.assertEqual({"REFRESH_INVALID"}, {public_error["content"]["application/json"]
                         ["schema"]["allOf"][1]["properties"]["error"]["properties"]["code"]["const"]})
        self.assertEqual("structured-without-secrets-required-not-yet-implemented", rotation["audit"])
        self.assertEqual("independent-evidence-and-recorded-authorization", rotation["compromiseRevocation"])
        self.assertEqual("recover-session-if-new-cookie-arrived-otherwise-reauthenticate", rotation["lostResponse"])
        self.assertEqual({"rotate": "implemented-in-ms-users", "continue": "pending"}, rotation["modeImplementation"])
        self.assertEqual({"current": "implemented-in-ms-users", "all": "pending"},
                         self.api["paths"]["/v1/auth/logout"]["post"]["x-scope-implementation"])
        self.assertNotIn("REFRESH_REUSED", json.dumps(self.api))
        self.assertEqual("draft-pending-team-approval", self.api["x-contract-status"])


    def test_short_access_lifetime_and_profile_policy_are_explicit(self):
        policy = self.api["x-jwt-policy"]
        self.assertEqual(("RS256", 2048, 240, 0), tuple(policy[k] for k in (
            "algorithm", "rsaBits", "maximumNominalLifetimeSeconds", "positiveExpirationLeewaySeconds"
        )))
        self.assertEqual(["alg", "kid"], policy["joseHeaderRequired"])
        self.assertNotIn("kid", policy["claimsRequired"])
        self.assertEqual(240, self.api["x-session-policy"]["accessTokenLifetimeSeconds"]["maximum"])
        auth = next(c["value"] for c in self.cases if c["name"] == "google-login")
        for ttl in (239, 240, 241, 900):
            value = copy.deepcopy(auth)
            value["expiresAt"] = value["session"]["serverTime"] + ttl
            if ttl <= 240:
                validate_auth(value)
            else:
                with self.assertRaises(AssertionError):
                    validate_auth(value)

    def test_identity_and_browser_policies_preserve_safety_boundaries(self):
        identity = self.api["x-identity-policy"]
        self.assertFalse(identity["automaticMergeByEmail"])
        self.assertFalse(identity["automaticHistoryTransfer"])
        self.assertFalse(identity["continuityRequiredForBasicAccess"])
        self.assertEqual(["passkey-bound-to-userId", "single-use-recovery-code"], identity["approvedContinuityMechanisms"])
        browser = self.api["x-browser-policy"]
        self.assertEqual("memory-only", browser["accessAndCsrfStorage"])
        self.assertEqual("opaque-rotating-cookie", browser["refresh"])
        self.assertTrue(browser["refreshSerializedAcrossTabs"])
        self.assertFalse(browser["generalReuseGrace"])
        self.assertEqual("effective-session-deadline-not-access-jwt",
                         self.api["x-session-policy"]["warningLeadSeconds"]["relativeTo"])

    def test_activity_contract_does_not_claim_client_request_is_evidence(self):
        activity = self.api["x-session-policy"]["activity"]
        self.assertEqual(60, activity["maximumProcessingDelaySeconds"])
        self.assertTrue(activity["singleCount"])
        self.assertTrue(activity["neverReviveExpiredSession"])
        self.assertFalse(activity["requestAloneIsEvidence"])
        op = self.api["paths"]["/v1/auth/session/activity"]["post"]
        self.assertEqual("blocked-pending-approved-evidence-protocol", op["x-integration-readiness"])

    def test_public_key_schemas_cannot_expose_private_material(self):
        public = next(c["value"] for c in self.cases if c["name"] == "public-jwks-structural-only")
        for field in ("d", "p", "q", "dp", "dq", "qi", "oth", "k"):
            value = copy.deepcopy(public)
            value["keys"][0][field] = "private-placeholder"
            self.assertFalse(validator(self.api, "Jwks").is_valid(value))

    def test_references_and_operation_ids_are_unique_and_resolvable(self):
        for ref in walk_refs(self.api):
            resolve_ref(ref, self.api, API_PATH)
        operation_ids = [op["operationId"] for _, _, op in self.operations()]
        self.assertEqual(len(operation_ids), len(set(operation_ids)))

    def test_non_auth_contracts_remain_byte_identical_to_reviewed_base(self):
        baseline = load(FIXTURES / "compatibility-baseline.json")
        for relative, expected in baseline["files"].items():
            self.assertEqual(expected, hashlib.sha256((ROOT / relative).read_bytes()).hexdigest(), relative)
        self.assertEqual(baseline["health"], fingerprint(self.api["paths"]["/health"]))
        for name, expected in baseline["usersSchemas"].items():
            self.assertEqual(expected, fingerprint(self.api["components"]["schemas"][name]), name)


if __name__ == "__main__":
    unittest.main()
