import base64
import copy
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from xml.etree import ElementTree as ET

import generate_policies as gp
from generate_policies import (PackageError, SPOOFABLE, analyze, build_package, check_upstream, validate,
                               verify_sources, write_output)
from policy_schema import valid_https_origin, validate_policy

HERE = Path(__file__).parent
ISS, AUD = "https://users.example.com", "markettec-api"
MANIFEST = json.loads((HERE / "operations.json").read_text())
OPENAPI_BYTES = (HERE / "../../contracts/openapi/users.json").read_bytes()
OPENAPI = json.loads(OPENAPI_BYTES)
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
SECTIONS = ("inbound", "backend", "outbound", "on-error")


def package(manifest=MANIFEST, upstream=UPSTREAM, evidence_dir=None):
    return build_package(manifest, JWKS, ISS, AUD, upstream, OPENAPI_BYTES, ROUTES, evidence_dir)


def mutated(fn):
    m = copy.deepcopy(MANIFEST)
    fn(m)
    return m


def op_of(m, op_id):
    return next(o for o in m["operations"] if o["id"] == op_id)


def evidence_case(testcase, names=("abuse_protection", "ms_users_contract"), **overrides):
    """Write real evidence documents to a temp dir and return (manifest, dir)."""
    directory = Path(tempfile.mkdtemp())
    testcase.addCleanup(lambda: __import__("shutil").rmtree(directory, ignore_errors=True))
    approvals = {}
    for name in names:
        doc = {"approval_type": name, "backend_sha": ROUTES["sha"], "openapi_contract_version": OPENAPI["info"]["version"],
               "openapi_sha256": hashlib.sha256(OPENAPI_BYTES).hexdigest(),
               "environment": "staging", "apim_revision": "rev-7", "review_id": f"review/{name}-1"}
        doc.update(overrides.get(name, {}))
        data = json.dumps(doc).encode()
        (directory / f"{name}.json").write_bytes(data)
        approvals[name] = {"evidence_file": f"{name}.json", "evidence_sha256": hashlib.sha256(data).hexdigest()}
    manifest = mutated(lambda m: (m["approvals"].update(approvals), m["target"].update(environment="staging", apim_revision="rev-7")))
    return manifest, directory


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
    return [p.replace("\\z", "\\Z") for p in re.findall(r'@"([^"]+)"', condition)]


class RoutesTest(unittest.TestCase):
    def test_manifest_matches_openapi_controllers_and_reference(self):
        verify_sources(MANIFEST, OPENAPI, ROUTES)
        self.assertEqual(22, len(MANIFEST["operations"]))
        self.assertEqual("08ccf056c975f6ec5d918c4cf76143fb04def7b2", ROUTES["sha"])

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
                analyze(mutated(edit), JWKS, ISS, AUD, None, OPENAPI_BYTES, ROUTES)

    def test_committed_state_has_no_approvals_or_target(self):
        self.assertEqual({"abuse_protection": None, "ms_users_contract": None}, MANIFEST["approvals"])
        self.assertEqual({"environment": None, "apim_revision": None}, MANIFEST["target"])
        self.assertFalse((HERE / "evidence").exists())
        result = package()
        self.assertEqual({"abuse_protection": False, "ms_users_contract": False}, result["approvals_verified"])


class ApprovalTest(unittest.TestCase):
    def statuses(self, manifest, directory):
        return {d["id"]: d["status"] for d in package(manifest, evidence_dir=directory)["definitions"]}

    def test_real_evidence_unblocks_only_its_own_group(self):
        manifest, directory = evidence_case(self, names=("abuse_protection",))
        status = self.statuses(manifest, directory)
        self.assertTrue(all(status[n] == "enabled" for n in ADMISSION))
        self.assertTrue(all(status[n] == "blocked" for n in PENDING))
        manifest, directory = evidence_case(self, names=("ms_users_contract",))
        status = self.statuses(manifest, directory)
        self.assertTrue(all(status[n] == "enabled" for n in PENDING))
        self.assertTrue(all(status[n] == "blocked" for n in ADMISSION))

    def test_invented_or_incomplete_references_rejected(self):
        manifest, directory = evidence_case(self)
        cases = {
            "invented hash": lambda m: m["approvals"]["abuse_protection"].update(evidence_sha256="b" * 64),
            "missing file": lambda m: m["approvals"]["abuse_protection"].update(evidence_file="missing.json"),
            "traversal": lambda m: m["approvals"]["abuse_protection"].update(evidence_file="../x.json"),
            "hash only": lambda m: m["approvals"].update(abuse_protection={"evidence_sha256": "b" * 64}),
            "boolean": lambda m: m["approvals"].update(abuse_protection=True),
            "no target": lambda m: m["target"].update(environment=None),
        }
        for name, edit in cases.items():
            broken = copy.deepcopy(manifest)
            edit(broken)
            with self.assertRaises(ValueError, msg=name):
                package(broken, evidence_dir=directory)

    def test_evidence_for_another_backend_contract_environment_or_type_rejected(self):
        wrong = {
            "backend": {"abuse_protection": {"backend_sha": "1" * 40}},
            "openapi": {"abuse_protection": {"openapi_contract_version": "0.0.0-other"}},
            "environment": {"abuse_protection": {"environment": "production"}},
            "revision": {"abuse_protection": {"apim_revision": "rev-8"}},
            "type": {"abuse_protection": {"approval_type": "ms_users_contract"}},
            "review id": {"abuse_protection": {"review_id": "x"}},
            "extra field": {"abuse_protection": {"approved": "yes"}},
        }
        for name, overrides in wrong.items():
            manifest, directory = evidence_case(self, **overrides)
            with self.assertRaises(ValueError, msg=name):
                package(manifest, evidence_dir=directory)

    def test_incomplete_or_tampered_documents_rejected(self):
        manifest, directory = evidence_case(self)
        path = directory / "abuse_protection.json"
        doc = json.loads(path.read_text())
        del doc["review_id"]
        data = json.dumps(doc).encode()
        path.write_bytes(data)
        with self.assertRaises(ValueError):  # hash no longer matches
            package(manifest, evidence_dir=directory)
        manifest["approvals"]["abuse_protection"]["evidence_sha256"] = hashlib.sha256(data).hexdigest()
        with self.assertRaises(ValueError):  # matches the hash but lacks a required field
            package(manifest, evidence_dir=directory)
        path.write_bytes(b"not json")
        manifest["approvals"]["abuse_protection"]["evidence_sha256"] = hashlib.sha256(b"not json").hexdigest()
        with self.assertRaises(ValueError):
            package(manifest, evidence_dir=directory)

    def test_evidence_is_bound_to_exact_openapi_bytes_not_just_version(self):
        manifest, directory = evidence_case(self)
        package(manifest, evidence_dir=directory)  # exact bytes: accepted
        changed = OPENAPI_BYTES + b"\n"  # same info.version, different file bytes
        self.assertEqual(json.loads(changed)["info"]["version"], OPENAPI["info"]["version"])
        with self.assertRaises(ValueError):
            build_package(manifest, JWKS, ISS, AUD, UPSTREAM, changed, ROUTES, directory)
        for bad in ("0" * 64, "xyz"):
            m2, d2 = evidence_case(self, abuse_protection={"openapi_sha256": bad})
            with self.assertRaises(ValueError):
                package(m2, evidence_dir=d2)
        m3, d3 = evidence_case(self)
        path = d3 / "abuse_protection.json"
        doc = json.loads(path.read_text())
        del doc["openapi_sha256"]
        data = json.dumps(doc).encode()
        path.write_bytes(data)
        m3["approvals"]["abuse_protection"]["evidence_sha256"] = hashlib.sha256(data).hexdigest()
        with self.assertRaises(ValueError):  # old-schema evidence without the file hash is incomplete
            package(m3, evidence_dir=d3)
        with self.assertRaises(ValueError):
            build_package(MANIFEST, JWKS, ISS, AUD, UPSTREAM, OPENAPI, ROUTES)  # parsed dict instead of bytes

    def test_symlinked_evidence_rejected(self):
        manifest, directory = evidence_case(self)
        link = directory / "link.json"
        os.symlink(directory / "abuse_protection.json", link)
        manifest["approvals"]["abuse_protection"]["evidence_file"] = "link.json"
        with self.assertRaises(ValueError):
            package(manifest, evidence_dir=directory)

    def test_valid_approval_still_leaves_deployment_unapproved(self):
        manifest, directory = evidence_case(self)
        result = package(manifest, evidence_dir=directory)
        self.assertFalse(result["deployment_approved"])
        self.assertFalse(result["azure_validated"])
        self.assertTrue(any("GitHub required review" in item for item in result["external_evidence_required"]))


class UpstreamHardeningTest(unittest.TestCase):
    """Regressions for Codex reproductions against inherited (global/product/api) policies."""

    @staticmethod
    def put(xml, fragment, scope):
        anchor = "<inbound>" if scope == "global" else "<inbound><base />"
        return xml.replace(anchor, anchor + fragment, 1)

    @staticmethod
    def header(name, value="x"):
        return f'<set-header name="{name}" exists-action="override"><value>{value}</value></set-header>'

    def each_scope(self):
        return (("global", GLOBAL), ("product", SCOPED), ("api", SCOPED))

    def test_dynamic_or_encoded_header_names_rejected_in_every_scope(self):
        names = ['@(&quot;Authorization&quot;)', '@(&quot;Coo&quot;+&quot;kie&quot;)', '@(&quot;X-User-&quot;+&quot;Id&quot;)',
                 "@{ return &quot;Authorization&quot;; }", "{{header-name}}", "@(@(&quot;Authorization&quot;))",
                 "&#65;uthorization", "&#x41;uthorization", "AUTHORIZATION", "authorization", "Cookie", "COOKIE",
                 "__Host-mtec-refresh", "X-User-Id", "X-Session-Id", "X-Authenticated-User", "X-CSRF-Token",
                 "Ocp-Apim-Subscription-Key", "X-Safe-But-Not-Listed", "X-Served-By ", " X-Served-By", "X Served By"]
        for scope, xml in self.each_scope():
            for name in names:
                with self.assertRaises(ValueError, msg=f"{scope}: {name}"):
                    check_upstream(scope, self.put(xml, self.header(name), scope))

    def test_dynamic_header_values_and_any_expression_rejected(self):
        for value in ('@(context.Request.Headers.GetValueOrDefault(&quot;Authorization&quot;,&quot;&quot;))', "{{secret}}", "@{ return 1; }"):
            for scope, xml in self.each_scope():
                with self.assertRaises(ValueError, msg=value):
                    check_upstream(scope, self.put(xml, self.header("X-Served-By", value), scope))

    def test_set_header_is_denied_in_every_scope_and_section(self):
        """No inherited header write/delete may weaken session-response protections (Cache-Control: no-store, HSTS, ...)."""
        names = ("Cache-Control", "CACHE-CONTROL", "&#67;ache-Control", "Strict-Transport-Security", "X-Frame-Options",
                 "X-Content-Type-Options", "X-Correlation-ID", "X-Served-By", "@(&quot;Cache-Control&quot;)", "Authorization")
        actions = (("delete", ""), ("override", "<value>public, max-age=3600</value>"), ("override", "<value>no-store</value>"),
                   ("skip", "<value>x</value>"), ("append", "<value>x</value>"))
        for scope, xml in self.each_scope():
            for section in ("inbound", "outbound", "on-error"):
                if scope == "global" and section == "inbound":
                    anchor = "<inbound>"
                elif section == "inbound":
                    anchor = "<inbound><base />"
                elif scope == "global":
                    anchor = f"<{section} />"
                else:
                    anchor = f"<{section}><base />"
                for name in names:
                    for action, value in actions:
                        fragment = f'<set-header name="{name}" exists-action="{action}">{value}</set-header>'
                        replacement = anchor + fragment if not anchor.endswith("/>") or "base" in anchor else f"<{section}>{fragment}</{section}>"
                        broken = xml.replace(anchor, replacement, 1)
                        self.assertNotEqual(xml, broken)
                        with self.assertRaises(ValueError, msg=f"{scope}/{section}/{name}/{action}"):
                            check_upstream(scope, broken)

    def test_header_denial_explains_the_incompatibility(self):
        with self.assertRaises(ValueError) as caught:
            check_upstream("global", GLOBAL.replace("<outbound />", '<outbound><set-header name="Cache-Control" exists-action="delete" /></outbound>'))
        self.assertIn("may not use <set-header>", str(caught.exception))
        self.assertIn("Cache-Control", str(caught.exception))

    def test_package_refuses_header_weakening_exports(self):
        for scope, xml in (("global", GLOBAL.replace("<outbound />", '<outbound><set-header name="Cache-Control" exists-action="delete" /></outbound>')),
                           ("api", SCOPED.replace("<outbound><base />", '<outbound><base /><set-header name="Strict-Transport-Security" exists-action="override"><value>max-age=0</value></set-header>'))):
            with self.assertRaises(ValueError):
                package(upstream=dict(UPSTREAM, **{scope: xml}))

    def test_generated_responses_keep_no_store_untouched(self):
        for xml in package()["policies"].values():
            self.assertNotIn("Cache-Control", xml)  # this generator neither sets nor removes cache protections

    def test_control_characters_rejected_after_xml_decoding(self):
        origin = lambda text: GLOBAL.replace("https://app.example.com", text)
        for raw in ("&#13;", "&#10;", "&#9;", "&#127;", "&#133;", "&#8232;", "&#8233;", "&#1;"):
            for text in (f"https://app.example.com{raw}", f"https://app.example.com{raw}X-User-Id: test", f"{raw}https://app.example.com"):
                with self.assertRaises(ValueError, msg=text):
                    check_upstream("global", origin(text))
        with self.assertRaises(ValueError):  # NUL cannot be expressed in XML 1.0 at all
            check_upstream("global", origin("https://app.example.com&#0;"))
        for bad in ("<allowed-methods><method>GET&#13;&#10;</method></allowed-methods>",
                    "<allowed-headers><header>X-A&#10;B</header></allowed-headers>"):
            with self.assertRaises(ValueError, msg=bad):
                check_upstream("global", GLOBAL.replace("</allowed-origins>", "</allowed-origins>" + bad))
        validate_policy(ET.fromstring("<policies><inbound><base /><return-response><set-status code=\"503\" reason=\"x\" />"
                                      "<set-body>ok</set-body></return-response></inbound></policies>"), "own")
        for raw in ("&#13;&#10;", "&#10;"):  # own-profile policies are held to the same rule
            for xml in (f"<policies><inbound><base /><return-response><set-status code=\"503\" reason=\"x\" /><set-body>a{raw}b</set-body></return-response></inbound></policies>",
                        f"<policies><inbound><base /><return-response><set-status code=\"503\" reason=\"x{raw}\" /></return-response></inbound></policies>"):
                with self.assertRaises(ValueError):
                    validate_policy(ET.fromstring(xml), "own")

    def test_https_origin_port_boundaries_and_structure(self):
        good = ["https://app.example.com", "https://app.example.com:1", "https://app.example.com:443",
                "https://app.example.com:65535", "https://a-b.example.com", "https://localhost", "https://a1.b2.example.co.cr:8443"]
        bad = ["https://app.example.com:65536", "https://app.example.com:99999", "https://app.example.com:0",
               "https://app.example.com:-1", "https://app.example.com:", "https://app.example.com:08080",
               "https://app.example.com:80a", "https://app.example.com:١٢٣", "https://user@app.example.com",
               "https://user:pw@app.example.com", "https://app.example.com/", "https://app.example.com/path",
               "https://app.example.com?x=1", "https://app.example.com#frag", "https://app.example.com:443/x",
               "https://", "https://:443", "https://-bad.example.com", "https://bad-.example.com", "https://a..example.com",
               "https://exa mple.com", "https://app.example.com ", " https://app.example.com", "http://app.example.com",
               "HTTPS://app.example.com", "https://[::1]:443", "https://[::1]", "https://app_example.com",
               "https://" + "a" * 64 + ".example.com", "https://" + ".".join(["a" * 60] * 5), "*.example.com",
               "https://app.example.com\\@evil.example", "https://evil.example\\.app.example.com"]
        for origin in good:
            self.assertTrue(valid_https_origin(origin), origin)
            check_upstream("global", GLOBAL.replace("https://app.example.com", origin))
        for origin in bad:
            self.assertFalse(valid_https_origin(origin), origin)
            if "\\" not in origin and not origin.startswith((" ", "*")) and not origin.endswith(" ") and "&" not in origin and "<" not in origin:
                with self.assertRaises(ValueError, msg=origin):
                    check_upstream("global", GLOBAL.replace("https://app.example.com", origin))

    def test_trace_is_not_supported_anywhere(self):
        trace = '<trace source="s"><message>@(context.Request.Headers.GetValueOrDefault(&quot;Authorization&quot;,&quot;&quot;))</message></trace>'
        harmless = '<trace source="s"><message>hello</message></trace>'
        for scope, xml in self.each_scope():
            for fragment in (trace, harmless):
                with self.assertRaises(ValueError):
                    check_upstream(scope, self.put(xml, fragment, scope))
        with self.assertRaises(ValueError):
            validate_policy(ET.fromstring("<policies><inbound><base /><trace source=\"s\"><message>m</message></trace></inbound></policies>"), "own")

    def test_cors_shape_rules(self):
        cors = lambda body, attrs="": f"<cors{attrs}><allowed-origins>{body}</allowed-origins></cors>"
        base = GLOBAL.replace(GLOBAL[GLOBAL.index("<cors"):GLOBAL.index("</cors>") + 7], "{CORS}")
        ok = [cors("<origin>https://app.example.com</origin>", ' allow-credentials="true"'),
              cors("<origin>https://a.example.com</origin><origin>https://b.example.com:8443</origin>", ' allow-credentials="true"'),
              cors("<origin>*</origin>")]
        for xml in ok:
            check_upstream("global", base.replace("{CORS}", xml))
        bad = [cors("<origin> * </origin>"), cors("<origin> * </origin>", ' allow-credentials="true"'),
               cors("<origin>*</origin>", ' allow-credentials="true"'),
               cors("<origin>{{allowed-origins}}</origin>", ' allow-credentials="true"'),
               cors("<origin>{{allowed-origins}}</origin>"),
               cors("<origin>http://app.example.com</origin>", ' allow-credentials="true"'),
               cors("<origin>https://app.example.com/path</origin>"), cors("<origin>https://*.example.com</origin>"),
               cors("<origin> https://app.example.com</origin>", ' allow-credentials="true"'),
               cors("<origin>https://a.example.com</origin>", ' allow-credentials="True"'),
               cors("<origin>@(&quot;https://x&quot;)</origin>"),
               cors("<origin>https://a.example.com</origin>") + cors("<origin>https://b.example.com</origin>"),
               cors("<origin>https://a.example.com</origin>") + "<cors/>"]
        for xml in bad:
            with self.assertRaises(ValueError, msg=xml):
                check_upstream("global", base.replace("{CORS}", xml))

    def test_empty_query_and_fragment_delimiters_rejected_in_every_scope(self):
        """urlsplit() hides a bare '?' or '#'; the origin must equal https://<netloc> exactly."""
        def with_origin(scope, xml, origin):
            if scope == "global":  # global already carries the single allowed <cors>
                return xml.replace("https://app.example.com", origin)
            return self.put(xml, f"<cors><allowed-origins><origin>{origin}</origin></allowed-origins></cors>", scope)

        for origin in ("https://spa.example", "https://spa.example:1", "https://spa.example:65535"):
            self.assertTrue(valid_https_origin(origin), origin)
            for scope, xml in self.each_scope():
                package(upstream=dict(UPSTREAM, **{scope: with_origin(scope, xml, origin)}))  # control: accepted
        bad = ["https://spa.example?", "https://spa.example#", "https://spa.example?#", "https://spa.example:443?",
               "https://spa.example:443#", "https://spa.example#?", "https://spa.example??", "https://spa.example##"]
        for origin in bad:
            self.assertFalse(valid_https_origin(origin), origin)
            for scope, xml in self.each_scope():
                broken = with_origin(scope, xml, origin)
                with self.assertRaises(ValueError, msg=f"{scope}: {origin}") as caught:
                    check_upstream(scope, broken)
                self.assertIn("literal https origin", str(caught.exception))  # rejected for the origin, not another reason
                with self.assertRaises(ValueError, msg=f"package {scope}: {origin}"):
                    package(upstream=dict(UPSTREAM, **{scope: broken}))

    def test_forward_request_attribute_types_ranges_and_exclusions(self):
        accept = ['timeout="30"', 'timeout-ms="5000"', 'timeout-ms="1"', 'follow-redirects="true"', 'continue-timeout="0"',
                  'timeout="300"', 'buffer-request-body="false" fail-on-error-status-code="true"']
        reject = ['timeout="not-an-integer"', 'timeout="0"', 'timeout="301"', 'timeout="-1"', 'timeout="1.5"', 'timeout=" 5"',
                  'timeout-ms="abc"', 'timeout-ms="0"', 'timeout-ms="300001"', 'timeout="5" timeout-ms="5000"',
                  'follow-redirects="yes"', 'retries="3"', 'continue-timeout="61"', 'timeout="٣"']
        for attrs in accept:
            check_upstream("global", GLOBAL.replace("<forward-request />", f"<forward-request {attrs} />"))
        for attrs in reject:
            with self.assertRaises(ValueError, msg=attrs):
                check_upstream("global", GLOBAL.replace("<forward-request />", f"<forward-request {attrs} />"))
        for scope in ("product", "api"):  # only the global scope may forward
            with self.assertRaises(ValueError):
                check_upstream(scope, SCOPED.replace("<backend><base /></backend>", "<backend><forward-request /></backend>"))

    def test_stray_attributes_and_text_rejected(self):
        bad = [SCOPED.replace("<policies>", '<policies x="1">'), SCOPED.replace("<policies>", "<policies>hello"),
               SCOPED.replace("</inbound>", "</inbound>hello"), SCOPED.replace("</policies>", "hello</policies>"),
               SCOPED.replace("<inbound>", '<inbound x="1">'), SCOPED.replace("<inbound><base />", "<inbound>hi<base />"),
               SCOPED.replace("<base /></inbound>", "<base />hi</inbound>"), SCOPED.replace("<outbound><base />", "<outbound><base />hi")]
        for xml in bad:
            with self.assertRaises(ValueError, msg=xml):
                check_upstream("api", xml)

    def test_every_scope_and_section_rejects_a_second_singleton(self):
        with self.assertRaises(ValueError):
            check_upstream("api", SCOPED.replace("<outbound><base />", "<outbound><base /><base />"))
        with self.assertRaises(ValueError):
            check_upstream("global", GLOBAL.replace("<on-error />", "<on-error><cors><allowed-origins><origin>https://a.example.com</origin></allowed-origins></cors></on-error>"))


class SchemaTest(unittest.TestCase):
    def swap(self, xml, old, new):
        self.assertIn(old, xml)
        return xml.replace(old, new)

    def test_valid_exports_accepted(self):
        for scope, xml in UPSTREAM.items():
            check_upstream(scope, xml)

    def test_invalid_structures_rejected(self):
        bad = {
            ("api", "backend base + forward-request"): self.swap(SCOPED, "<backend><base />", "<backend><base /><forward-request />"),
            ("api", "forward-request in outbound"): self.swap(SCOPED, "<outbound><base />", "<outbound><base /><forward-request />"),
            ("api", "forward-request in inbound"): self.swap(SCOPED, "<inbound><base />", "<inbound><base /><forward-request />"),
            ("api", "forward-request replaces base"): self.swap(SCOPED, "<backend><base /></backend>", "<backend><forward-request /></backend>"),
            ("global", "global backend base"): self.swap(GLOBAL, "<forward-request />", "<base />"),
            ("global", "two forward-request"): self.swap(GLOBAL, "<forward-request />", "<forward-request /><forward-request />"),
            ("global", "global empty backend"): self.swap(GLOBAL, "<backend><forward-request /></backend>", "<backend />"),
            ("global", "cors outbound"): self.swap(GLOBAL, "<outbound />", "<outbound><cors><allowed-origins><origin>https://a.example</origin></allowed-origins></cors></outbound>"),
            ("global", "cors without origins"): self.swap(GLOBAL, "<allowed-origins><origin>https://app.example.com</origin></allowed-origins>", ""),
            ("global", "bad forward attr"): self.swap(GLOBAL, "<forward-request />", '<forward-request retries="3" />'),
            ("global", "bad bool"): self.swap(GLOBAL, "<forward-request />", '<forward-request follow-redirects="maybe" />'),
            ("api", "set-header no name"): self.swap(SCOPED, "<outbound><base />", "<outbound><base /><set-header><value>a</value></set-header>"),
            ("api", "set-header no value"): self.swap(SCOPED, "<outbound><base />", '<outbound><base /><set-header name="X-A" exists-action="override" />'),
            ("api", "delete with value"): self.swap(SCOPED, "<outbound><base />", '<outbound><base /><set-header name="X-A" exists-action="delete"><value>a</value></set-header>'),
            ("api", "bad action"): self.swap(SCOPED, "<outbound><base />", '<outbound><base /><set-header name="X-A" exists-action="x"><value>a</value></set-header>'),
            ("api", "trace without message"): self.swap(SCOPED, "<outbound><base />", '<outbound><base /><trace source="a" />'),
            ("api", "stray text"): self.swap(SCOPED, "<inbound><base />", "<inbound>hello<base />"),
            ("api", "unknown element"): self.swap(SCOPED, "<inbound><base />", "<inbound><base /><anything />"),
            ("api", "unknown attr on base"): self.swap(SCOPED, "<inbound><base />", '<inbound><base x="1" />'),
            ("api", "section order"): "<policies><backend><base /></backend><inbound><base /></inbound><outbound><base /></outbound><on-error><base /></on-error></policies>",
            ("api", "missing base"): self.swap(SCOPED, "<outbound><base /></outbound>", "<outbound />"),
            ("api", "double base"): self.swap(SCOPED, "<inbound><base />", "<inbound><base /><base />"),
            ("global", "global with base"): SCOPED,
            ("api", "fragment"): self.swap(SCOPED, "<inbound><base />", '<inbound><base /><include-fragment fragment-id="x" />'),
            ("api", "dtd"): "<!DOCTYPE a [<!ENTITY x 'y'>]>" + SCOPED,
            ("api", "wrong root"): "<foo/>",
        }
        for (scope, name), xml in bad.items():
            with self.assertRaises(ValueError, msg=name):
                check_upstream(scope, xml)

    def test_inherited_scopes_cannot_touch_credentials_or_end_the_request(self):
        injected = {
            "authorization": '<set-header name="Authorization" exists-action="override"><value>x</value></set-header>',
            "authorization delete": '<set-header name="authorization" exists-action="delete" />',
            "cookie": '<set-header name="Cookie" exists-action="delete" />',
            "csrf": '<set-header name="X-CSRF-Token" exists-action="override"><value>x</value></set-header>',
            "origin": '<set-header name="Origin" exists-action="override"><value>x</value></set-header>',
            "identity": '<set-header name="X-User-Id" exists-action="override"><value>1</value></set-header>',
            "return-response": '<return-response><set-status code="200" reason="OK" /></return-response>',
            "choose": '<choose><when condition="@(true)"><return-response><set-status code="403" reason="no" /></return-response></when></choose>',
            "set-variable": '<set-variable name="internalJwt" value="x" />',
            "jwt": '<validate-jwt header-name="Authorization" />',
            "google": '<set-header name="X-A" exists-action="override"><value>accounts.google.com</value></set-header>',
        }
        for name, fragment in injected.items():
            for scope, xml in (("api", SCOPED), ("global", GLOBAL), ("product", SCOPED)):
                anchor = "<inbound><base />" if scope != "global" else "<inbound>"
                with self.assertRaises(ValueError, msg=f"{name}/{scope}"):
                    check_upstream(scope, xml.replace(anchor, anchor + fragment, 1))

    def test_wildcard_credentialed_cors_rejected(self):
        with self.assertRaises(ValueError):
            check_upstream("global", GLOBAL.replace("https://app.example.com", "*"))

    def test_comments_are_not_controls(self):
        check_upstream("api", SCOPED.replace("<inbound><base />", "<inbound><base /><!-- <validate-jwt /> accounts.google.com -->"))
        with self.assertRaises(ValueError):
            check_upstream("api", SCOPED.replace("<inbound><base />", "<inbound><!-- <base /> -->"))

    def test_generated_policies_pass_own_schema_and_bad_own_policies_fail(self):
        for xml in package()["policies"].values():
            validate_policy(ET.fromstring(xml), "own")
        invalid = [
            "<policies><inbound><base /></inbound><backend><base /><forward-request /></backend></policies>",
            "<policies><inbound><base /><forward-request /></inbound></policies>",
            "<policies><inbound><base /></inbound><outbound><forward-request /></outbound></policies>",
            "<policies><inbound><return-response><set-body>x</set-body><set-status code=\"1\" reason=\"r\" /></return-response></inbound></policies>",
            "<policies><inbound><choose><otherwise><base /></otherwise></choose></inbound></policies>",
        ]
        for xml in invalid:
            with self.assertRaises(ValueError, msg=xml):
                validate_policy(ET.fromstring(xml), "own")

    def test_missing_scope_names_exact_exports(self):
        result = analyze(MANIFEST, JWKS, ISS, AUD, {"global": GLOBAL}, OPENAPI_BYTES, ROUTES)
        self.assertEqual({"product", "api"}, set(result["missing_exports"]))
        self.assertEqual("analysis", result["kind"])
        with self.assertRaises(ValueError):
            analyze(MANIFEST, JWKS, ISS, AUD, {"operation": SCOPED}, OPENAPI_BYTES, ROUTES)


class PackageTest(unittest.TestCase):
    def test_package_refused_without_verified_upstream(self):
        for upstream in (None, {}, {"global": GLOBAL}, {"global": GLOBAL, "product": SCOPED}):
            with self.assertRaises(PackageError):
                package(upstream=upstream)
        invalid = SCOPED.replace("<backend><base />", "<backend><base /><forward-request />")
        for scope in ("product", "api"):
            with self.assertRaises(ValueError):
                package(upstream=dict(UPSTREAM, **{scope: invalid}))

    def test_package_requires_jwks_issuer_audience(self):
        with self.assertRaises(PackageError):
            build_package(MANIFEST, None, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES)
        with self.assertRaises(PackageError):
            build_package(MANIFEST, JWKS, "", AUD, UPSTREAM, OPENAPI_BYTES, ROUTES)

    def test_results_never_claim_azure_validation_or_deployment_approval(self):
        for result in (analyze(MANIFEST, JWKS, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES), package()):
            self.assertFalse(result["azure_validated"])
            self.assertFalse(result["deployment_approved"])
            self.assertTrue(result["external_evidence_required"])
        self.assertEqual("candidate_package", package()["kind"])
        self.assertEqual("analysis", analyze(MANIFEST, JWKS, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES)["kind"])

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



class OutputTest(unittest.TestCase):
    def tmp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        return Path(directory.name)

    def cli(self, root, mode, out, extra=()):
        jwks = root / "jwks.json"
        jwks.write_text(json.dumps(JWKS))
        args = [sys.executable, str(HERE / "generate_policies.py"), "--mode", mode, "--jwks", str(jwks), "--issuer", ISS,
                "--audience", AUD, "--output-dir", str(out), *extra]
        return subprocess.run(args, cwd=root, capture_output=True, text=True)

    def upstream_args(self, root):
        args = []
        for scope, xml in UPSTREAM.items():
            (root / f"{scope}.xml").write_text(xml)
            args += [f"--upstream-{scope}", str(root / f"{scope}.xml")]
        return args

    def test_analysis_and_candidate_names_are_distinct_and_indexed(self):
        root = self.tmp()
        analysis = self.cli(root, "analyze", root / "a")
        self.assertEqual(0, analysis.returncode, analysis.stderr)
        self.assertEqual([], list((root / "a").glob("*.xml")))
        candidate = self.cli(root, "package", root / "p", self.upstream_args(root))
        self.assertEqual(0, candidate.returncode, candidate.stderr)
        self.assertEqual([], list((root / "p").glob("*.xml.txt")))
        for directory, suffix, index in ((root / "a", ".xml.txt", "operations.analysis.json"),
                                         (root / "p", ".candidate.xml", "operations.candidate.json")):
            meta = json.loads((directory / index).read_text())
            files = {p.name for p in directory.iterdir()} - {index}
            self.assertEqual(files, {d["policy_file"] for d in meta["definitions"]})
            self.assertTrue(all(name.endswith(suffix) for name in files))
            self.assertEqual(22, len(files))
            self.assertFalse(meta["deployment_approved"])
            self.assertFalse(meta["azure_validated"])
            self.assertNotIn("policies", meta)

    def test_consecutive_runs_cannot_reuse_or_mix_previous_artifacts(self):
        root = self.tmp()
        self.assertEqual(0, self.cli(root, "package", root / "out", self.upstream_args(root)).returncode)
        before = sorted(p.name for p in (root / "out").iterdir())
        again = self.cli(root, "analyze", root / "out")
        self.assertNotEqual(0, again.returncode)
        self.assertIn("not empty", again.stderr)
        self.assertEqual(before, sorted(p.name for p in (root / "out").iterdir()))  # untouched, not mixed
        self.assertTrue(any(n.endswith(".candidate.xml") for n in before))
        self.assertFalse(any(n.endswith(".xml.txt") for n in before))

    def test_existing_empty_directory_is_accepted_and_file_path_rejected(self):
        root = self.tmp()
        (root / "empty").mkdir()
        self.assertEqual(0, self.cli(root, "analyze", root / "empty").returncode)
        self.assertEqual(23, len(list((root / "empty").iterdir())))
        (root / "file").write_text("x")
        self.assertNotEqual(0, self.cli(root, "analyze", root / "file").returncode)

    def test_refused_package_leaves_nothing_behind(self):
        root = self.tmp()
        refused = self.cli(root, "package", root / "out")  # no upstream exports
        self.assertNotEqual(0, refused.returncode)
        self.assertIn("refused", refused.stderr)
        self.assertEqual([], list(root.glob("out*")) + list(root.glob(".out*")))

    def test_failure_midway_leaves_no_partial_artifacts(self):
        root = self.tmp()
        result = analyze(MANIFEST, JWKS, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES)
        real = Path.write_text
        calls = {"n": 0}

        def flaky(self_path, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 5:
                raise OSError("disk full")
            return real(self_path, *args, **kwargs)

        with mock.patch.object(Path, "write_text", flaky):
            with self.assertRaises(OSError):
                write_output(result, root / "out")
        self.assertEqual([], list(root.iterdir()))  # neither out/ nor a staging directory
        write_output(result, root / "out")  # a retry into the same path works
        self.assertEqual(23, len(list((root / "out").iterdir())))

    def test_write_output_refuses_non_empty_directory(self):
        root = self.tmp()
        (root / "out").mkdir()
        (root / "out" / "stale.xml").write_text("<policies/>")
        with self.assertRaises(FileExistsError):
            write_output(analyze(MANIFEST, JWKS, ISS, AUD, UPSTREAM, OPENAPI_BYTES, ROUTES), root / "out")
        self.assertEqual(["stale.xml"], [p.name for p in (root / "out").iterdir()])


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
        manifest, directory = evidence_case(self)
        self.open = package(manifest, evidence_dir=directory)["policies"]  # every operation unblocked, to inspect real controls
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
            for section in SECTIONS:
                if section == "backend":
                    self.assertEqual(["base"], [c.tag for c in root.find("backend")], name)
                    continue
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

    def test_expressions_use_plain_dictionary_members(self):
        for xml in self.open.values():
            self.assertNotIn("GetValueOrDefault", xml)
        origin = next(c for c in ET.fromstring(self.open["refreshSession"]).iter("when") if "allowed-origins" in c.attrib["condition"])
        self.assertIn('ContainsKey("Origin") ? context.Request.Headers["Origin"] : new string[0]', origin.attrib["condition"])
        self.assertFalse(package()["azure_validated"])  # expressions are not gateway-verified

    def test_committed_package_closes_blocked_routes(self):
        for name in ADMISSION | PENDING:
            self.assertNotIn("Cookie", self.closed[name])
            self.assertIn("503", self.closed[name])


if __name__ == "__main__":
    unittest.main()
