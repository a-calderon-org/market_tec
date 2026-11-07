import base64
import copy
import json
import re
import unittest
from pathlib import Path
from unittest import mock
from xml.etree import ElementTree as ET

import generate_policies as gp
import security_reference
from generate_policies import PackageError, SPOOFABLE, analyze, build_package, check_upstream, validate, verify_sources

HERE = Path(__file__).parent
ISS, AUD = "https://users.example.com", "markettec-api"
MANIFEST = json.loads((HERE / "operations.json").read_text())
OPENAPI = json.loads((HERE / "../../contracts/openapi/users.json").read_text())
ROUTES = json.loads((HERE / "backend-routes.json").read_text())
KEY = {"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "key1", "e": "AQAB",
       "n": base64.urlsafe_b64encode(bytes([128]) + bytes(254) + bytes([1])).decode().rstrip("=")}
JWKS = {"keys": [KEY]}
GLOBAL = ("<policies><inbound><cors allow-credentials=\"true\"><allowed-origins><origin>https://app.example.com</origin>"
          "</allowed-origins></cors></inbound><backend><forward-request /></backend><outbound /><on-error /></policies>")
SCOPED = ("<policies><inbound><base /></inbound><backend><base /></backend><outbound><base /></outbound>"
          "<on-error><base /></on-error></policies>")
UPSTREAM = {"global": GLOBAL, "product": SCOPED, "api": SCOPED}
PENDING = {"createMethodProofAttempt", "verifyGoogleMethodProof", "requestEmailMethodProof",
           "verifyEmailMethodProof", "linkOwnAuthMethod"}
ADMISSION = {"createAuthenticationAttempt", "exchangeGoogleCredential", "legacyGoogleRegistrationCompatibility",
             "requestInstitutionalEmailLink", "confirmInstitutionalEmailLink"}
OPS = {o["id"]: o for o in MANIFEST["operations"]}


def package(manifest=MANIFEST, upstream=UPSTREAM):
    return build_package(manifest, JWKS, ISS, AUD, upstream, OPENAPI, ROUTES)


def mutated(fn):
    m = copy.deepcopy(MANIFEST)
    fn(m)
    return m


def op_of(m, op_id):
    return next(o for o in m["operations"] if o["id"] == op_id)


def approve(*names):
    """Approve through the reviewed allowlist, as a code change would."""
    evidence = {n: "a" * 63 + str(i) for i, n in enumerate(names)}
    manifest = mutated(lambda m: m["approvals"].update({n: {"evidence_sha256": h} for n, h in evidence.items()}))
    return manifest, mock.patch.dict(security_reference.APPROVED_EVIDENCE, evidence)


def simulate(policy_xml, parent_inbound=("send-request",), parent_backend=("forward-request",)):
    """Conceptual isolated publication: stub parent scopes with hostile actions, no conditions evaluated."""
    root = ET.fromstring(policy_xml)
    log = {"parent_actions": [], "denied": None, "backend": False}
    for node in root.find("inbound"):
        if node.tag == "base":
            log["parent_actions"] += list(parent_inbound)
        elif node.tag == "return-response":
            log["denied"] = node.find("set-status").attrib["code"]
            return log
    for node in root.find("backend"):
        if node.tag == "base":
            log["backend"] = log["backend"] or "forward-request" in parent_backend
        elif node.tag == "forward-request":
            log["backend"] = True
    return log


def regexes(condition):
    return [p.replace("\\z", "\\Z").replace("\\A", "\\A") for p in re.findall(r'@"([^"]+)"', condition)]


class RoutesTest(unittest.TestCase):
    def test_manifest_matches_openapi_controllers_and_reference(self):
        verify_sources(MANIFEST, OPENAPI, ROUTES)
        self.assertEqual(22, len(MANIFEST["operations"]))
        self.assertEqual("2927bc64aed9c82f0a2353fc811be9f87df9c24d", ROUTES["sha"])

    def test_public_paths_follow_x_public_apim_path(self):
        self.assertEqual("/auth/google", OPS["exchangeGoogleCredential"]["public_path"])
        self.assertEqual("/v1/auth/google", OPS["exchangeGoogleCredential"]["backend_path"])
        self.assertEqual("/usuarios/{userId}", OPS["getUserProfile"]["public_path"])
        self.assertEqual("/health", OPS["getUsersHealth"]["public_path"])

    def test_inconsistent_mappings_rejected(self):
        for fn in (lambda m: op_of(m, "getUserProfile").update(public_path="/users/{userId}"),
                   lambda m: op_of(m, "getUserProfile").update(backend_path="/v1/usuarios/{id}"),
                   lambda m: op_of(m, "refreshSession").update(backend_path="/v1/auth/refreshx"),
                   lambda m: m["operations"].pop()):
            with self.assertRaises(ValueError):
                verify_sources(mutated(fn), OPENAPI, ROUTES)

    def test_bad_manifest_fields_rejected(self):
        for fn in (lambda m: m["operations"].append(copy.deepcopy(m["operations"][0])),
                   lambda m: m["operations"][0].update(auth="none"),
                   lambda m: m["operations"][0].update(public_path="/a/../b"),
                   lambda m: m["operations"][0].update(extra=1),
                   lambda m: m.update(approvals={"abuse_protection": True, "ms_users_contract": None}),
                   lambda m: m["approvals"].update(extra=None),
                   lambda m: op_of(m, "refreshSession").update(csrf="none"),
                   lambda m: op_of(m, "refreshSession").update(origin=False),
                   lambda m: op_of(m, "getSessionState").update(csrf="required"),
                   lambda m: op_of(m, "logoutSession").update(cookie_mode="required")):
            with self.assertRaises(ValueError):
                validate(mutated(fn))


class ReferenceTest(unittest.TestCase):
    def test_downgrades_and_unblocking_by_editing_manifest_are_rejected(self):
        edits = {
            "jwt to public": lambda m: op_of(m, "getOwnUserProfile").update(auth="public"),
            "drop origin": lambda m: op_of(m, "updateOwnUserProfile").update(origin=False),
            "drop csrf": lambda m: op_of(m, "confirmInstitutionalEmailLink").update(csrf="none", cookie_mode="required"),
            "drop cookie": lambda m: op_of(m, "refreshSession").update(cookies=["attempt"]),
            "admission off": lambda m: op_of(m, "exchangeGoogleCredential").update(anonymous_admission=False),
            "contract reconciled": lambda m: op_of(m, "linkOwnAuthMethod").update(contract_status="reconciled"),
            "remove operation": lambda m: m["operations"].remove(op_of(m, "getUserProfile")),
        }
        for name, edit in edits.items():
            with self.assertRaises(ValueError, msg=name):
                analyze(mutated(edit), JWKS, ISS, AUD, None, OPENAPI, ROUTES)

    def test_boolean_or_unknown_evidence_never_unblocks(self):
        for claim in ({"evidence_sha256": "b" * 64}, None):
            manifest = mutated(lambda m: m["approvals"].update(abuse_protection=claim, ms_users_contract=claim))
            result = package(manifest)
            self.assertTrue(all(result["definitions"][i]["status"] == "blocked"
                                for i, d in enumerate(result["definitions"]) if d["id"] in ADMISSION | PENDING))
        with self.assertRaises(ValueError):
            validate(mutated(lambda m: m["approvals"].update(abuse_protection=True)))

    def test_reviewed_allowlist_unblocks_only_its_own_group(self):
        manifest, patch = approve("abuse_protection")
        with patch:
            d = {x["id"]: x["status"] for x in package(manifest)["definitions"]}
        self.assertTrue(all(d[n] == "enabled" for n in ADMISSION))
        self.assertTrue(all(d[n] == "blocked" for n in PENDING))
        manifest, patch = approve("ms_users_contract")
        with patch:
            d = {x["id"]: x["status"] for x in package(manifest)["definitions"]}
        self.assertTrue(all(d[n] == "enabled" for n in PENDING))
        self.assertTrue(all(d[n] == "blocked" for n in ADMISSION))

    def test_committed_state_has_no_approved_evidence(self):
        self.assertEqual({}, security_reference.APPROVED_EVIDENCE)
        self.assertEqual({"abuse_protection": None, "ms_users_contract": None}, MANIFEST["approvals"])
        self.assertEqual(64, len(security_reference.reference_digest()))


class UpstreamTest(unittest.TestCase):
    def test_valid_exports_accepted(self):
        for scope, xml in UPSTREAM.items():
            check_upstream(scope, xml)

    def test_structure_and_unknown_elements_rejected(self):
        bad = {
            "anything": "<policies><inbound><anything/></inbound><backend/><outbound/><on-error/></policies>",
            "fragment": SCOPED.replace("<inbound><base />", "<inbound><base /><include-fragment fragment-id=\"x\" />"),
            "wrong root": "<foo/>",
            "missing section": "<policies><inbound><base /></inbound></policies>",
            "order": "<policies><backend><base /></backend><inbound><base /></inbound><outbound><base /></outbound><on-error><base /></on-error></policies>",
            "no base": SCOPED.replace("<outbound><base /></outbound>", "<outbound />"),
            "double base": SCOPED.replace("<inbound><base />", "<inbound><base /><base />"),
            "jwt": SCOPED.replace("<inbound><base />", "<inbound><base /><validate-jwt header-name=\"Authorization\" />"),
            "google": SCOPED.replace("<inbound><base />", "<inbound><base /><set-variable name=\"a\" value=\"https://accounts.google.com\" />"),
            "wildcard cors": GLOBAL.replace("https://app.example.com", "*"),
            "identity header": SCOPED.replace("<inbound><base />", "<inbound><base /><set-header name=\"X-User-Id\" exists-action=\"override\"><value>1</value></set-header>"),
            "dtd": "<!DOCTYPE a [<!ENTITY x 'y'>]>" + SCOPED,
            "global with base": SCOPED,
        }
        for name, xml in bad.items():
            with self.assertRaises(ValueError, msg=name):
                check_upstream("api" if name != "global with base" else "global", xml)

    def test_comments_are_not_controls(self):
        commented = SCOPED.replace("<inbound><base />", "<inbound><base /><!-- <validate-jwt /> accounts.google.com -->")
        check_upstream("api", commented)  # an inert comment is neither a control nor a violation
        only_comment_base = SCOPED.replace("<inbound><base />", "<inbound><!-- <base /> -->")
        with self.assertRaises(ValueError):
            check_upstream("api", only_comment_base)  # a commented <base /> does not provide precedence

    def test_missing_scope_names_exact_exports(self):
        result = analyze(MANIFEST, JWKS, ISS, AUD, {"global": GLOBAL}, OPENAPI, ROUTES)
        self.assertEqual({"product", "api"}, set(result["missing_exports"]))
        self.assertFalse(result["publishable"])
        with self.assertRaises(ValueError):
            analyze(MANIFEST, JWKS, ISS, AUD, {"operation": SCOPED}, OPENAPI, ROUTES)


class PackageTest(unittest.TestCase):
    def test_package_refused_without_verified_upstream(self):
        for upstream in (None, {}, {"global": GLOBAL}, {"global": GLOBAL, "product": SCOPED}):
            with self.assertRaises(PackageError):
                package(upstream=upstream)
        with self.assertRaises(ValueError):
            package(upstream=dict(UPSTREAM, api=SCOPED.replace("<on-error><base />", "<on-error><x/><base />")))

    def test_package_requires_jwks_issuer_audience(self):
        with self.assertRaises(PackageError):
            build_package(MANIFEST, None, ISS, AUD, UPSTREAM, OPENAPI, ROUTES)
        with self.assertRaises(PackageError):
            build_package(MANIFEST, JWKS, "", AUD, UPSTREAM, OPENAPI, ROUTES)

    def test_analysis_is_never_publishable(self):
        self.assertFalse(analyze(MANIFEST, JWKS, ISS, AUD, UPSTREAM, OPENAPI, ROUTES)["publishable"])
        self.assertTrue(package()["publishable"])

    def test_definitions_apply_backend_path_and_policy(self):
        result = package()
        for definition in result["definitions"]:
            op = OPS[definition["id"]]
            self.assertEqual((op["method"], op["public_path"], "ms-users", op["backend_path"]),
                             (definition["method"], definition["url_template"], definition["backend"], definition["backend_path"]))
            rewrite = ET.fromstring(result["policies"][op["id"]]).find("./inbound/rewrite-uri")
            if definition["status"] == "blocked":
                self.assertIsNone(rewrite)
            else:
                self.assertEqual(op["backend_path"], rewrite.attrib["template"])
            self.assertEqual(64, len(definition["policy_sha256"]))
        self.assertEqual("/v1/usuarios/{userId}", ET.fromstring(result["policies"]["getUserProfile"]).find("./inbound/rewrite-uri").attrib["template"])

    def test_cli_separates_analysis_from_package(self):
        import subprocess, sys, tempfile
        with tempfile.TemporaryDirectory() as tmp:
            jwks = Path(tmp, "jwks.json")
            jwks.write_text(json.dumps(JWKS))
            base = [sys.executable, str(HERE / "generate_policies.py"), "--jwks", str(jwks), "--issuer", ISS, "--audience", AUD]
            out = Path(tmp, "analysis")
            subprocess.run(base + ["--mode", "analyze", "--output-dir", str(out)], check=True, cwd=tmp)
            self.assertFalse(list(out.glob("*.xml")))
            self.assertEqual(22, len(list(out.glob("*.xml.txt"))))
            refused = subprocess.run(base + ["--mode", "package", "--output-dir", str(Path(tmp, "pkg"))], cwd=tmp, capture_output=True)
            self.assertNotEqual(0, refused.returncode)
            self.assertFalse(Path(tmp, "pkg").exists())


class BlockedRoutesTest(unittest.TestCase):
    def test_blocked_policies_are_terminal_denials(self):
        result = package()
        for name in ADMISSION | PENDING:
            xml = result["policies"][name]
            root = ET.fromstring(xml)
            self.assertEqual([], root.findall(".//base"), name)
            self.assertEqual(0, len(root.find("backend")), name)
            for banned in ("rewrite-uri", "forward-request", "validate-jwt"):
                self.assertNotIn(banned, xml)
            log = simulate(xml)
            self.assertEqual("503", log["denied"], name)
            self.assertEqual([], log["parent_actions"], name)
            self.assertFalse(log["backend"], name)

    def test_blocked_routes_never_reach_backend_even_with_hostile_parents(self):
        for name in ADMISSION | PENDING:
            log = simulate(package()["policies"][name], ("send-request", "set-variable"), ("forward-request",))
            self.assertFalse(log["backend"])
            self.assertEqual([], log["parent_actions"])

    def test_error_codes(self):
        policies = package()["policies"]
        self.assertIn("ADMISSION_DISABLED", policies["exchangeGoogleCredential"])
        self.assertIn("BACKEND_CONTRACT_PENDING", policies["linkOwnAuthMethod"])

    def test_open_routes_do_reach_backend_through_verified_parents(self):
        log = simulate(package()["policies"]["getOwnUserProfile"], ("cors",), ("forward-request",))
        self.assertTrue(log["backend"])


class PolicyTest(unittest.TestCase):
    def setUp(self):
        manifest, patch = approve("abuse_protection", "ms_users_contract")
        with patch:
            self.open = package(manifest)["policies"]  # every operation unblocked, to inspect real controls
        self.closed = package()["policies"]

    def conditions(self, name, policies=None):
        root = ET.fromstring((policies or self.open)[name])
        return [w.attrib["condition"] for w in root.findall("./inbound/choose/when")]

    def codes(self, name):
        return [json.loads(w.find("./return-response/set-body").text)["error"]["code"]
                for w in ET.fromstring(self.open[name]).findall("./inbound/choose/when")
                if w.find("./return-response/set-body").text.startswith('{"error":{"code":"') and "INVALID_TOKEN" not in w.find("./return-response/set-body").text]

    def test_open_policies_inherit_once_and_strip_identity(self):
        for name, xml in self.open.items():
            root = ET.fromstring(xml)
            for section in ("inbound", "backend", "outbound", "on-error"):
                self.assertEqual(1, len(root.findall(f"./{section}/base")), (name, section))
            self.assertEqual("base", root.find("./inbound")[0].tag)
            stripped = {h.attrib["name"] for h in root.findall("./inbound/set-header") if h.attrib.get("exists-action") == "delete"}
            self.assertTrue(set(SPOOFABLE) <= stripped, name)

    def test_internal_jwt_only_on_jwt_classes(self):
        for name, xml in self.open.items():
            root = ET.fromstring(xml)
            check = root.find("./inbound/validate-jwt")
            if OPS[name]["auth"] in ("jwt", "jwt_cookie"):
                self.assertEqual(ISS, check.find("./issuers/issuer").text)
                self.assertEqual(AUD, check.find("./audiences/audience").text)
                self.assertEqual("0", check.attrib["clock-skew"])
                self.assertEqual("true", check.attrib["require-expiration-time"])
                self.assertEqual("Bearer", check.attrib["require-scheme"])
                self.assertIn("RS256", xml)
                self.assertIn("at+jwt", xml)
            else:
                self.assertIsNone(check, name)
            for forbidden in ("accounts.google.com", "openid-config", 'name="d"', "rate-limit-by-key", "<cors", "include-fragment"):
                self.assertNotIn(forbidden, xml, name)

    def test_origin_enforced_exactly_where_required_and_rejects_duplicates(self):
        for name, op in OPS.items():
            origin_checks = [c for c in self.conditions(name) if "allowed-origins" in c]
            self.assertEqual(op["origin"], bool(origin_checks), name)
            for c in origin_checks:
                self.assertIn("Length != 1", c)
                self.assertIn('"null"', c)
                self.assertIn("{{allowed-origins}}", c)

    def test_magic_link_request_creates_the_attempt(self):
        name = "requestInstitutionalEmailLink"
        xml = self.open[name]
        self.assertEqual(["ORIGIN_DENIED"], self.codes(name))
        for fragment in ("__Host-mtec", "X-CSRF-Token", "Cookie"):
            self.assertNotIn(fragment, xml)
        self.assertEqual("/v1/auth/email/requests", ET.fromstring(xml).find("./inbound/rewrite-uri").attrib["template"])

    def test_magic_link_confirm_uses_email_attempt_cookie_and_csrf(self):
        name = "confirmInstitutionalEmailLink"
        xml = self.open[name]
        self.assertEqual(["ORIGIN_DENIED", "AUTH_PROOF_INVALID", "CSRF_INVALID"], self.codes(name))
        self.assertIn("__Host-mtec-email-attempt=", xml)
        self.assertNotIn("__Host-mtec-attempt=", xml)
        self.assertNotIn("__Host-mtec-refresh", xml)
        self.assertNotIn("__Host-mtec-email-attempt", self.open["exchangeGoogleCredential"])
        self.assertIn("__Host-mtec-attempt=", self.open["exchangeGoogleCredential"])
        self.assertIn("!= 1", " ".join(self.conditions(name)))

    def test_cookie_name_regexes_distinguish_similar_names_and_duplicates(self):
        confirm = next(c for c in self.conditions("confirmInstitutionalEmailLink") if "Matches" in c)
        count_pattern = regexes(confirm)[0]
        value = "a" * 64
        def count(header):
            return len(re.findall(count_pattern, header))
        self.assertEqual(1, count(f"__Host-mtec-email-attempt={value}"))
        self.assertEqual(0, count(f"__Host-mtec-attempt={value}"))      # Google cookie is not the email one
        self.assertEqual(0, count(f"x__Host-mtec-email-attempt={value}"))
        self.assertEqual(2, count(f"__Host-mtec-email-attempt={value}; __Host-mtec-email-attempt={value}"))
        self.assertEqual(1, count(f"a=1; __Host-mtec-email-attempt={value}"))
        valid_pattern = regexes(confirm)[1]
        self.assertTrue(re.search(valid_pattern, f"__Host-mtec-email-attempt={value}"))
        self.assertFalse(re.search(valid_pattern, "__Host-mtec-email-attempt=short"))
        self.assertFalse(re.search(valid_pattern, f"__Host-mtec-email-attempt={value}\n"))
        self.assertIn('string.Join("; "', confirm)  # split Cookie headers are merged before counting

    def test_csrf_regex_and_duplicate_headers(self):
        condition = next(c for c in self.conditions("refreshSession") if "X-CSRF-Token" in c)
        pattern = regexes(condition)[0]
        self.assertTrue(re.search(pattern, "abcDEF123-_."))
        for bad in ("", "a b", "a,b", "a\n", "x" * 257):
            self.assertFalse(re.search(pattern, bad), repr(bad))
        self.assertIn("Length != 1", condition)

    def test_required_cookie_classes(self):
        for name in ("refreshSession", "recordSessionActivity"):
            conditions = " ".join(self.conditions(name))
            self.assertIn("__Host-mtec-refresh=", conditions)
            self.assertIn(".Count != 1", conditions)
            self.assertIn("CSRF_INVALID", self.open[name])

    def test_logout_remains_idempotent_without_cookie(self):
        conditions = self.conditions("logoutSession")
        cookie_check = next(c for c in conditions if "Matches" in c and "> 1" in c)
        csrf_check = next(c for c in conditions if "X-CSRF-Token" in c)
        self.assertNotIn("!= 1", cookie_check)
        self.assertIn("== 1) &&", csrf_check)
        self.assertEqual(["ORIGIN_DENIED", "REFRESH_INVALID", "CSRF_INVALID"], self.codes("logoutSession"))

    def test_session_snapshot_validates_cookie_only_if_present(self):
        conditions = " ".join(self.conditions("getSessionState"))
        self.assertIn("> 1", conditions)
        self.assertNotIn("!= 1", conditions)
        self.assertNotIn("CSRF", self.open["getSessionState"])

    def test_cookie_never_becomes_identity(self):
        for name, xml in self.open.items():
            if OPS[name]["auth"] in ("cookie", "public"):
                root = ET.fromstring(xml)
                self.assertIsNone(root.find("./inbound/validate-jwt"))
                self.assertNotIn("set-variable", xml)
            for header in ET.fromstring(xml).findall(".//set-header"):
                if header.attrib["name"] in SPOOFABLE:
                    self.assertEqual("delete", header.attrib["exists-action"])
            self.assertNotIn("remove-cookie", xml.lower())

    def test_userid_template_parameters(self):
        for name in ("getUserProfile", "updateUserProfile"):
            self.assertEqual("/usuarios/{userId}", OPS[name]["public_path"])
            rewrite = ET.fromstring(self.open[name]).find("./inbound/rewrite-uri")
            self.assertEqual("/v1/usuarios/{userId}", rewrite.attrib["template"])
            self.assertEqual("true", rewrite.attrib["copy-unmatched-params"])

    def test_committed_package_closes_blocked_routes(self):
        for name in ADMISSION | PENDING:
            self.assertNotIn("Cookie", self.closed[name])
            self.assertIn("503", self.closed[name])


if __name__ == "__main__":
    unittest.main()
