"""MTEC-12/MTEC-41: release profile ms-users-google-v1 (eight operations, keyless candidate API)."""
import copy
import json
import re
import tempfile
import unittest
from unittest import mock
from pathlib import Path
from xml.etree import ElementTree as ET

import generate_policies as gp
from release_profiles import RELEASE_PROFILES
from route_check import EXPECTED_CALLS, RouteError, resolve, versioned_api_url
from test_generate_policies import (AUD, ISS, JWKS, MANIFEST, OPENAPI_BYTES, ROUTES, SPOOFABLE, UPSTREAM,
                                    evidence_case, simulate)

HERE = Path(__file__).parent
FRONTEND = HERE / "../../app/frontend/src/app"
PROFILE = "ms-users-google-v1"
ORIGINS = ["https://app.example.com"]
RELEASED = set(RELEASE_PROFILES[PROFILE]["operations"])
GATEWAY, USERS = "https://apim.example.com", "https://users.example.com"
PROFILE_OPS = {"getOwnUserProfile", "updateOwnUserProfile"}


def release(manifest=MANIFEST, evidence_dir=None, origins=ORIGINS, mode="package"):
    fn = gp.build_package if mode == "package" else gp.analyze
    return fn(manifest, JWKS, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES, evidence_dir, PROFILE, origins)


def approved(testcase):
    manifest, directory = evidence_case(testcase)
    return release(manifest, directory)


def definitions(result):
    return {d["id"]: d for d in result["definitions"]}


class ScopeTest(unittest.TestCase):
    def test_exactly_eight_http_operations_in_seven_capabilities(self):
        ops = {o["id"]: o for o in MANIFEST["operations"]}
        self.assertEqual(8, len(RELEASED))
        self.assertEqual(RELEASED, set(EXPECTED_CALLS))
        self.assertEqual(7, len({ops[i]["backend_path"] for i in RELEASED}))
        for op_id, (method, _, java) in EXPECTED_CALLS.items():
            self.assertEqual((method, java), (ops[op_id]["method"], ops[op_id]["backend_path"]))
            self.assertIn([method, java], ROUTES["routes"])  # merged ms-users controllers serve it

    def test_unreleased_routes_are_terminal_denials_even_when_approved(self):
        result = approved(self)
        for d in result["definitions"]:
            if d["id"] in RELEASED:
                continue
            self.assertEqual(("blocked", ["not_in_release_profile"]), (d["status"], d["blocked_reasons"]), d["id"])
            log = simulate(result["policies"][d["id"]])
            self.assertEqual(("404", False, []), (log["denied"], log["backend"], log["parent_actions"]), d["id"])
            self.assertIn("OPERATION_NOT_RELEASED", result["policies"][d["id"]])
        for blocked in ("requestInstitutionalEmailLink", "createMethodProofAttempt", "linkOwnAuthMethod",
                        "recordSessionActivity", "getUserProfile", "getUsersHealth"):
            self.assertEqual("blocked", definitions(result)[blocked]["status"])

    def test_release_never_lifts_approval_blocks(self):
        result = release()  # committed manifest: no approvals
        defs = definitions(result)
        for op_id in ("createAuthenticationAttempt", "exchangeGoogleCredential", "legacyGoogleRegistrationCompatibility"):
            self.assertEqual(["abuse_protection_unapproved"], defs[op_id]["blocked_reasons"])
        for op_id in RELEASED - {"createAuthenticationAttempt", "exchangeGoogleCredential",
                                 "legacyGoogleRegistrationCompatibility"}:
            self.assertEqual("enabled", defs[op_id]["status"], op_id)

    def test_with_evidence_all_eight_enabled_and_reach_backend(self):
        result = approved(self)
        for op_id in RELEASED:
            self.assertEqual("enabled", definitions(result)[op_id]["status"])
            self.assertTrue(simulate(result["policies"][op_id])["backend"])

    def test_unknown_profile_rejected(self):
        with self.assertRaises(ValueError):
            gp.build_package(MANIFEST, JWKS, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES, None, "everything", ORIGINS)


class RouteChainTest(unittest.TestCase):
    def defs(self):
        return [d for d in approved(self)["definitions"] if d["id"] in RELEASED]

    def chain(self, defs=None, base=GATEWAY + "/users", path="users/v1", services=None, users=USERS):
        defs = self.defs() if defs is None else defs
        return resolve(base, GATEWAY, path, defs, services or {d["id"]: users for d in defs}, USERS)

    def test_angular_mirror_matches_source(self):
        source = (FRONTEND / "core/api/api-url.ts").read_text()
        self.assertIn("return /\\/v1$/.test(base) ? `${base}${path}` : `${base}/v1${path}`;", source)
        self.assertEqual("https://h/v1/me/profile", versioned_api_url("https://h/", "/me/profile"))
        self.assertEqual("https://h/v1/me/profile", versioned_api_url("https://h/v1", "me/profile"))

    def test_angular_calls_use_these_paths(self):
        adapter = (FRONTEND / "core/auth/v2/http-auth-api.adapter.ts").read_text()
        profile = (FRONTEND / "features/profile/services/user.service.ts").read_text()
        self.assertRegex(adapter, r"purpose === 'register' \? '/auth/google/registrations' : '/auth/google'")
        for path in ("/auth/attempts", "/auth/session", "/auth/refresh", "/auth/logout"):
            self.assertIn(f"'{path}'", adapter)
        self.assertIn("versionedApiUrl(environment.apiBaseUrl, '/me/profile')", profile)

    def test_all_eight_resolve_with_base_with_or_without_v1(self):
        for base in (GATEWAY + "/users", GATEWAY + "/users/", GATEWAY + "/users/v1"):
            table = self.chain(base=base)
            self.assertEqual(8, len(table))
            for row in table:
                self.assertEqual(USERS + EXPECTED_CALLS[row["id"]][2], row["backend_url"])
                self.assertEqual(GATEWAY + "/users/v1" + EXPECTED_CALLS[row["id"]][1], row["browser_url"])

    def test_missing_v1_in_suffix_detected(self):
        with self.assertRaisesRegex(RouteError, "matches 0 APIM operations"):
            self.chain(path="users")

    def test_duplicated_v1_detected(self):
        with self.assertRaisesRegex(RouteError, "duplicated /v1 in public URL"):
            self.chain(base=GATEWAY + "/users/v1/v1")
        with self.assertRaisesRegex(RouteError, "duplicated /v1 in backend URL"):
            resolve(GATEWAY + "/users", GATEWAY, "users/v1", self.defs(), {i: USERS + "/v1" for i in RELEASED},
                    USERS + "/v1")

    def test_swapped_login_and_registration_detected(self):
        defs = copy.deepcopy(self.defs())
        by_id = {d["id"]: d for d in defs}
        login, register = by_id["exchangeGoogleCredential"], by_id["legacyGoogleRegistrationCompatibility"]
        login["url_template"], register["url_template"] = register["url_template"], login["url_template"]
        with self.assertRaisesRegex(RouteError, "routed to legacyGoogleRegistrationCompatibility"):
            self.chain(defs)

    def test_wrong_rewrite_detected(self):
        defs = copy.deepcopy(self.defs())
        next(d for d in defs if d["id"] == "refreshSession")["backend_path"] = "/auth/refresh"
        with self.assertRaisesRegex(RouteError, "rewrite reaches /auth/refresh"):
            self.chain(defs)

    def test_profile_on_another_backend_detected(self):
        services = {i: USERS for i in RELEASED}
        services["getOwnUserProfile"] = "https://legacy-backend.example.com"
        with self.assertRaisesRegex(RouteError, "getOwnUserProfile: forwarded to https://legacy-backend"):
            self.chain(services=services)

    def test_base_url_on_another_host_detected(self):
        with self.assertRaisesRegex(RouteError, "not on the APIM gateway"):
            self.chain(base="https://other.example.com/users")

    def test_generated_route_chain_is_in_the_output(self):
        chain = approved(self)["release"]["route_chain"]
        self.assertEqual(RELEASED, {row["id"] for row in chain})


class AdmissionTest(unittest.TestCase):
    def test_candidate_api_is_keyless_https_and_unapplied(self):
        api = approved(self)["release"]["api_definition"]
        self.assertIs(False, api["subscriptionRequired"])
        self.assertEqual(["https"], api["protocols"])
        self.assertIs(False, api["applied_in_azure"])
        self.assertIsNone(api["serviceUrl"])
        self.assertNotEqual("markettec-api-v1", api["name"])  # the shared API keeps its subscription

    def test_public_login_and_registration_never_ask_for_a_subscription_key(self):
        result = approved(self)
        for op_id in ("createAuthenticationAttempt", "exchangeGoogleCredential", "legacyGoogleRegistrationCompatibility"):
            xml = result["policies"][op_id]
            self.assertNotIn("Ocp-Apim-Subscription-Key", xml)
            self.assertNotIn("subscription", xml.lower())
            self.assertIsNone(ET.fromstring(xml).find(".//validate-jwt"))
            self.assertTrue(simulate(xml)["backend"])

    def test_widening_the_profile_in_place_is_rejected_by_the_reference(self):
        manifest = copy.deepcopy(MANIFEST)
        next(o for o in manifest["operations"] if o["id"] == "getOwnUserProfile")["auth"] = "public"
        with self.assertRaises(ValueError):
            release(manifest)

    def test_release_bundle_refuses_a_keyed_or_http_api(self):
        for change in ({"subscriptionRequired": True}, {"protocols": ["http", "https"]}, {"service_url_path": "/v1"}):
            spec = copy.deepcopy(RELEASE_PROFILES[PROFILE])
            spec["api"].update(change)
            with mock.patch.dict(RELEASE_PROFILES, {PROFILE: spec}):
                with self.assertRaises(ValueError):
                    approved(self)


class JwtTest(unittest.TestCase):
    def test_profile_requires_internal_jwt_from_ms_users_only(self):
        result = approved(self)
        for op_id in PROFILE_OPS:
            root = ET.fromstring(result["policies"][op_id])
            check = root.find("./inbound/validate-jwt")
            self.assertEqual(("Authorization", "Bearer", "true", "true", "0"),
                             tuple(check.attrib[k] for k in ("header-name", "require-scheme", "require-signed-tokens",
                                                             "require-expiration-time", "clock-skew")))
            self.assertEqual([ISS], [i.text for i in check.findall("./issuers/issuer")])
            self.assertEqual([AUD], [a.text for a in check.findall("./audiences/audience")])
            self.assertEqual(["key1"], [k.attrib["id"] for k in check.findall("./issuer-signing-keys/key")])
            condition = " ".join(w.attrib["condition"] for w in root.iter("when"))
            for claim in ('jwt.Algorithm != "RS256"', 'jwt.Type != "at+jwt"', "TotalSeconds > 240", '"sid"'):
                self.assertIn(claim, condition)

    def test_google_id_token_cannot_reach_profile(self):
        result = approved(self)
        for op_id in PROFILE_OPS:
            xml = result["policies"][op_id]
            for google in ("accounts.google.com", "googleapis", "openid-config"):
                self.assertNotIn(google, xml)
            # A Google ID token is issued by accounts.google.com, typ JWT, no sid: every check rejects it.
            self.assertNotIn("accounts.google.com", [i.text for i in ET.fromstring(xml).iter("issuer")])

    def test_cookie_endpoints_never_turn_a_cookie_into_identity(self):
        result = approved(self)
        for op_id in RELEASED - PROFILE_OPS:
            root = ET.fromstring(result["policies"][op_id])
            self.assertIsNone(root.find(".//validate-jwt"), op_id)
            set_vars = [e.attrib["name"] for e in root.iter("set-variable")]
            self.assertEqual([], set_vars, op_id)
            added = [e.attrib["name"] for e in root.find("inbound").findall("set-header")
                     if e.attrib.get("exists-action") != "delete"]
            self.assertEqual([], added, op_id)

    def test_package_still_fails_closed_without_jwks_issuer_audience_or_exports(self):
        with self.assertRaises(gp.PackageError):
            gp.build_package(MANIFEST, None, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES, None, PROFILE, ORIGINS)
        with self.assertRaises(gp.PackageError):
            gp.build_package(MANIFEST, JWKS, ISS, AUD, {"global": UPSTREAM["global"]}, OPENAPI_BYTES, ROUTES, None,
                             PROFILE, ORIGINS)


class HeadersCorsTest(unittest.TestCase):
    PRESERVED = ("Origin", "Cookie", "Set-Cookie", "X-CSRF-Token", "X-MTEC-Client", "Authorization")

    def test_only_spoofable_identity_headers_are_deleted(self):
        result = approved(self)
        for op_id in RELEASED:
            root = ET.fromstring(result["policies"][op_id])
            deleted = {e.attrib["name"] for e in root.iter("set-header") if e.attrib.get("exists-action") == "delete"}
            self.assertEqual(set(SPOOFABLE), deleted, op_id)
            names = {e.attrib["name"].lower() for e in root.iter("set-header")}
            self.assertFalse(names & {h.lower() for h in self.PRESERVED} - {"content-type"}, op_id)

    def test_forged_identity_headers_are_removed_before_any_check(self):
        result = approved(self)
        for op_id in RELEASED:
            inbound = list(ET.fromstring(result["policies"][op_id]).find("inbound"))
            self.assertEqual(["base", *["set-header"] * len(SPOOFABLE)], [e.tag for e in inbound[:1 + len(SPOOFABLE)]])

    def test_api_scope_cors_is_explicit_and_credentialed(self):
        xml = approved(self)["extra_files"]["api-scope.candidate.xml"]
        cors = ET.fromstring(xml).find("./inbound/cors")
        self.assertEqual("true", cors.attrib["allow-credentials"])
        self.assertEqual(ORIGINS, [o.text for o in cors.findall("./allowed-origins/origin")])
        headers = {h.text for h in cors.findall("./allowed-headers/header")}
        self.assertTrue({"X-CSRF-Token", "X-MTEC-Client", "Authorization", "Content-Type"} <= headers)
        self.assertNotIn("*", xml)
        gp.check_upstream("api", xml)

    def test_api_cors_precedes_inherited_global_cors(self):
        origin = "https://staging.example.com"
        xml = release(origins=[origin])["extra_files"]["api-scope.candidate.xml"]
        inbound = ET.fromstring(xml).find("inbound")
        inherited = ET.fromstring(UPSTREAM["global"]).find("inbound")
        effective = [node for policy in inbound for node in (inherited if policy.tag == "base" else [policy])]
        self.assertEqual([origin, ORIGINS[0]], [node.findtext("allowed-origins/origin") for node in effective])

    def test_wildcard_or_unsafe_origins_rejected(self):
        for origins in ([], None, ["*"], ["http://app.example.com"], ["https://app.example.com/path"],
                        ["https://user@app.example.com"], ORIGINS * 2, ["{{allowed-origins}}"]):
            with self.assertRaises(ValueError, msg=origins):
                release(origins=origins)


class OutputTest(unittest.TestCase):
    def test_written_package_has_no_secrets_and_no_approval_claims(self):
        out = Path(tempfile.mkdtemp()) / "pkg"
        gp.write_output(approved(self), out)
        files = {p.name: p.read_text() for p in out.iterdir()}
        self.assertIn("api-scope.candidate.xml", files)
        self.assertIn("api-definition.candidate.json", files)
        index = json.loads(files["operations.candidate.json"])
        self.assertEqual((False, False), (index["azure_validated"], index["deployment_approved"]))
        blob = "\n".join(files.values())
        for secret in ("Ocp-Apim-Subscription-Key", "subscription-key", "client_secret", "PRIVATE KEY", '"d":'):
            self.assertNotIn(secret, blob)

    def test_repository_public_artifacts_carry_no_keys(self):
        pattern = re.compile(r"Ocp-Apim-Subscription-Key\s*[:=]\s*['\"]?[0-9a-f]{32}|BEGIN [A-Z ]*PRIVATE KEY", re.I)
        roots = [HERE, HERE / "../../contracts/openapi", HERE / "../../app/frontend/src"]
        for root in roots:
            for path in root.rglob("*"):
                if path.is_file() and path.suffix in (".py", ".json", ".xml", ".md", ".ts", ".html"):
                    self.assertIsNone(pattern.search(path.read_text(errors="ignore")), path)

    def test_committed_manifest_keeps_approvals_null(self):
        self.assertEqual({"abuse_protection": None, "ms_users_contract": None}, MANIFEST["approvals"])
        self.assertEqual({"environment": None, "apim_revision": None}, MANIFEST["target"])


if __name__ == "__main__":
    unittest.main()


class PartialStagingPackageTest(unittest.TestCase):
    """Staging without JWKS/issuer/audience and without a product scope: denials only, never an enablement."""
    NO_PRODUCT = {s: x for s, x in UPSTREAM.items() if s != "product"}

    def partial(self, **kwargs):
        args = dict(jwt_unconfigured=True, no_product_scope=True)
        args.update(kwargs)
        return gp.build_package(MANIFEST, None, "", "", self.NO_PRODUCT, OPENAPI_BYTES, ROUTES, None, PROFILE, ORIGINS,
                                **args)

    def test_jwt_operations_are_terminal_denials(self):
        result = self.partial()
        defs = definitions(result)
        for op_id in PROFILE_OPS:
            self.assertEqual(("blocked", ["internal_jwt_unconfigured"]), (defs[op_id]["status"], defs[op_id]["blocked_reasons"]))
            log = simulate(result["policies"][op_id])
            self.assertEqual(("503", False, []), (log["denied"], log["backend"], log["parent_actions"]))
            self.assertIn("INTERNAL_JWT_UNCONFIGURED", result["policies"][op_id])
        self.assertEqual("unconfigured: JWT operations denied", result["internal_jwt"])
        self.assertTrue(result["product_scope"].startswith("none"))

    def test_partial_package_enables_nothing_the_full_package_would_not(self):
        partial, full = definitions(self.partial()), definitions(release())
        enabled = {i for i, d in partial.items() if d["status"] == "enabled"}
        self.assertEqual({"getSessionState", "refreshSession", "logoutSession"}, enabled)
        self.assertTrue(enabled <= {i for i, d in full.items() if d["status"] == "enabled"})
        for op_id in ("createAuthenticationAttempt", "exchangeGoogleCredential", "legacyGoogleRegistrationCompatibility"):
            self.assertEqual(["abuse_protection_unapproved"], partial[op_id]["blocked_reasons"])
        for op_id in set(partial) - RELEASED:
            self.assertEqual(["not_in_release_profile"], partial[op_id]["blocked_reasons"])

    def test_partial_options_are_explicit_and_consistent(self):
        with self.assertRaises(gp.PackageError):  # no release profile
            gp.build_package(MANIFEST, None, "", "", self.NO_PRODUCT, OPENAPI_BYTES, ROUTES, jwt_unconfigured=True)
        with self.assertRaises(gp.PackageError):  # JWT inputs contradict jwt_unconfigured
            gp.build_package(MANIFEST, JWKS, ISS, AUD, self.NO_PRODUCT, OPENAPI_BYTES, ROUTES, None, PROFILE, ORIGINS,
                             jwt_unconfigured=True, no_product_scope=True)
        with self.assertRaises(gp.PackageError):  # product still required without no_product_scope
            self.partial(no_product_scope=False)
        with self.assertRaises(ValueError):  # a product export contradicts no_product_scope
            gp.build_package(MANIFEST, None, "", "", UPSTREAM, OPENAPI_BYTES, ROUTES, None, PROFILE, ORIGINS,
                             jwt_unconfigured=True, no_product_scope=True)
        with self.assertRaises(gp.PackageError):  # global and api exports are still mandatory
            gp.build_package(MANIFEST, None, "", "", {"global": UPSTREAM["global"]}, OPENAPI_BYTES, ROUTES, None,
                             PROFILE, ORIGINS, jwt_unconfigured=True, no_product_scope=True)
