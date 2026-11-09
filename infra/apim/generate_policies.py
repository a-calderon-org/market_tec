"""Generate APIM operation definitions and policies from operations.json (policy as code).

Two clearly separated outputs, each written to a fresh directory by the CLI:
* analyze(): local review (*.xml.txt). Never a package.
* build_package(): a *candidate* package (*.candidate.xml). It passed LOCAL structural checks only:
  Azure has not validated it and deployment is not approved (see EXTERNAL_EVIDENCE).

Fail-closed rules:
* Security fields must equal SECURITY_REFERENCE (reviewed code), so editing operations.json
  cannot downgrade protection or lift a block.
* Approvals need a real evidence document whose SHA-256, backend SHA, OpenAPI version,
  environment and APIM revision all match; a bare hash proves nothing.
* Blocked operations get a terminal deny: no <base /> before return-response and an empty
  backend section, so neither inherited actions nor the backend are reachable.
* Cookies are only checked for presence/format; they never authenticate. Session and CSRF
  verification belong to ms-users.
* A release profile (release_profiles.py, reviewed code) only narrows: operations outside it get a
  terminal deny, operations inside it still need their approvals. It adds a candidate API definition
  (no subscription key) and an API-scope CORS policy with explicit origins, never `*`.
* Partial staging package (explicit opt-in, release profile only): `jwt_unconfigured` turns every
  internal-JWT operation into a terminal deny instead of requiring JWKS/issuer/audience, and
  `no_product_scope` records that the API belongs to no APIM product instead of requiring a product
  export. Neither can enable an operation; both are recorded in the output.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

from build_jwt_policy import build as build_jwt
from policy_schema import valid_https_origin, validate_policy
from release_profiles import NOT_RELEASED, profile as release_profile
from route_check import resolve as resolve_routes
from security_reference import COOKIE_NAMES, SECURITY_REFERENCE

HERE = Path(__file__).parent
AUTH = {"public", "cookie", "jwt", "jwt_cookie"}
COOKIE_ERRORS = {"attempt": "AUTH_PROOF_INVALID", "email_attempt": "AUTH_PROOF_INVALID", "refresh": "REFRESH_INVALID"}
METHODS = {"GET", "POST", "PUT"}
SPOOFABLE = ("X-User-Id", "X-Session-Id", "X-Authenticated-User")
# Gateway -> Container Apps authentication (MTEC-12/D04). Container Apps authentication validates the Entra token
# only in `Authorization`, so the gateway moves the (already validated) internal user JWT to this header first.
USER_TOKEN_HEADER = "X-MTEC-User-Authorization"
GATEWAY_RESOURCE = re.compile(r"api://[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
SCOPES = ["global", "product", "api"]
PATH = re.compile(r"/[A-Za-z0-9._{}/-]*")
ID = re.compile(r"[A-Za-z][A-Za-z0-9]{2,63}")
SHA256 = re.compile(r"[0-9a-f]{64}")
FIELDS = {"id", "method", "public_path", "backend_path", "auth", "cookies", "cookie_mode", "origin",
          "csrf", "anonymous_admission", "contract_status"}
REFERENCE_FIELDS = ("auth", "cookies", "cookie_mode", "origin", "csrf", "anonymous_admission", "contract_status")
APPROVALS = ("abuse_protection", "ms_users_contract")
UPSTREAM_MARKERS = ("accounts.google.com", "openid-config", "googleapis", "validate-jwt", "validate-azure-ad-token")
SECTIONS = ("inbound", "backend", "outbound", "on-error")
COOKIE_VALUE = r"[A-Za-z0-9._~+/=-]{16,512}"
CSRF_VALUE = r"\A[\x21-\x2B\x2D-\x7E]{1,256}\z"
EVIDENCE_DIR = HERE / "evidence"
EVIDENCE_FIELDS = {"approval_type", "backend_sha", "openapi_contract_version", "openapi_sha256", "environment",
                   "apim_revision", "review_id"}
EVIDENCE_FILE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.json")
TOKEN = re.compile(r"[A-Za-z0-9._:/#-]{3,128}")
BACKEND_SHA = re.compile(r"[0-9a-f]{40}")
REQUIRED_EXPORTS = {
    "global": "policy exported at global scope (service-wide policy)",
    "product": "policy exported for the product containing the users API",
    "api": "policy exported at API scope for the users API"}
EXTERNAL_EVIDENCE = [
    "effective policy of EVERY product containing the users API (one export per scope is not the whole hierarchy)",
    "operation-level policies currently on the API (they are replaced, and were not exported)",
    "effective-policy review showing no fragments, named-value effects or extra scopes beyond the exports",
    "gateway validation of each policy and expression on the target tier (Consumption); local checks are not that",
    "operator deployment approval, plus GitHub required review/branch protection covering infra/apim/** and evidence/ (not verifiable by this tool)"]


class PackageError(ValueError):
    """The inputs cannot produce a publishable package."""


def _params(path: str) -> list:
    return re.findall(r"\{([A-Za-z0-9]+)\}", path)


def validate(manifest: dict) -> list:
    if manifest.get("version") != 3 or manifest.get("backend") != "ms-users":
        raise ValueError("unsupported manifest")
    approvals = manifest.get("approvals")
    if not isinstance(approvals, dict) or set(approvals) != set(APPROVALS):
        raise ValueError("approvals must list exactly " + ", ".join(APPROVALS))
    for value in approvals.values():
        if value is not None and (not isinstance(value, dict) or set(value) != {"evidence_file", "evidence_sha256"}
                                  or not EVIDENCE_FILE.fullmatch(str(value["evidence_file"]))
                                  or not SHA256.fullmatch(str(value["evidence_sha256"]))):
            raise ValueError("approval must be null or an {evidence_file, evidence_sha256} object")
    target = manifest.get("target")
    if not isinstance(target, dict) or set(target) != {"environment", "apim_revision"} or any(
            v is not None and not (isinstance(v, str) and TOKEN.fullmatch(v)) for v in target.values()):
        raise ValueError("target must hold environment and apim_revision (null until known)")
    if manifest.get("upstream_scopes") != SCOPES:
        raise ValueError("upstream scopes must be global, product, api")
    ops, ids, routes, backend = manifest.get("operations"), set(), set(), set()
    if not isinstance(ops, list) or not ops:
        raise ValueError("no operations")
    for op in ops:
        if not isinstance(op, dict) or set(op) != FIELDS:
            raise ValueError("unexpected operation fields")
        if not ID.fullmatch(str(op["id"])) or op["id"] in ids:
            raise ValueError("invalid or duplicate id")
        if op["method"] not in METHODS or op["auth"] not in AUTH:
            raise ValueError("invalid method or auth")
        for key in ("public_path", "backend_path"):
            if not isinstance(op[key], str) or not PATH.fullmatch(op[key]) or ".." in op[key] or "//" in op[key]:
                raise ValueError("invalid path")
        if _params(op["public_path"]) != _params(op["backend_path"]):
            raise ValueError("path parameters differ between public and backend path")
        cookies = op["cookies"]
        if not isinstance(cookies, list) or not set(cookies) <= set(COOKIE_NAMES) or len(set(cookies)) != len(cookies):
            raise ValueError("invalid cookies")
        if op["cookie_mode"] not in ("none", "required", "optional") or (op["cookie_mode"] == "none") != (not cookies):
            raise ValueError("cookie_mode inconsistent with cookies")
        if op["csrf"] not in ("none", "required", "if_cookie"):
            raise ValueError("invalid csrf mode")
        if (op["csrf"] == "required" and op["cookie_mode"] != "required") or (op["csrf"] == "if_cookie" and op["cookie_mode"] != "optional"):
            raise ValueError("csrf mode inconsistent with cookie_mode")
        if op["method"] != "GET" and cookies and op["csrf"] == "none":
            raise ValueError("state-changing cookie operation requires csrf")
        if op["csrf"] != "none" and not op["origin"]:
            raise ValueError("csrf-protected operation must enforce Origin")
        if op["method"] == "GET" and (op["csrf"] != "none" or op["origin"]):
            raise ValueError("safe method cannot require origin or csrf")
        if not isinstance(op["origin"], bool) or not isinstance(op["anonymous_admission"], bool):
            raise ValueError("invalid boolean flag")
        if op["contract_status"] not in ("reconciled", "pending_ms_users_pr23"):
            raise ValueError("invalid contract_status")
        if op["auth"] in ("jwt", "jwt_cookie") and op["anonymous_admission"]:
            raise ValueError("jwt operation cannot admit anonymous traffic")
        if op["auth"] in ("cookie", "jwt_cookie") and not cookies:
            raise ValueError("cookie operation without cookie")
        if op["auth"] in ("public", "jwt") and cookies:
            raise ValueError("unexpected cookies")
        route = (op["method"], op["public_path"])
        if route in routes or (op["method"], op["backend_path"]) in backend:
            raise ValueError("duplicate route")
        ids.add(op["id"])
        routes.add(route)
        backend.add((op["method"], op["backend_path"]))
    return ops


def verify_reference(ops: list) -> None:
    """The manifest may not differ from the reviewed security reference in any direction."""
    if {(o["method"], o["backend_path"]) for o in ops} != set(SECURITY_REFERENCE):
        raise ValueError("operations differ from the security reference")
    for op in ops:
        expected = SECURITY_REFERENCE[(op["method"], op["backend_path"])]
        for field in REFERENCE_FIELDS:
            if op[field] != expected[field]:
                raise ValueError(f"{op['id']}: {field} differs from the security reference")


def verify_sources(manifest: dict, openapi: dict, backend_routes: dict) -> None:
    """Reject mappings that disagree with the security reference, OpenAPI or the real controllers."""
    ops = validate(manifest)
    verify_reference(ops)
    java = {tuple(route) for route in backend_routes["routes"]}
    declared = {(op["method"], op["backend_path"]) for op in ops}
    if declared != java:
        raise ValueError(f"manifest and controller routes differ: {sorted(declared ^ java)}")
    spec = {(m.upper(), p): o for p, item in openapi["paths"].items() for m, o in item.items() if m in ("get", "post", "put")}
    if declared != set(spec):
        raise ValueError(f"manifest and OpenAPI operations differ: {sorted(declared ^ set(spec))}")
    for op in ops:
        item = spec[(op["method"], op["backend_path"])]
        if op["public_path"] != item.get("x-public-apim-path", op["backend_path"]):
            raise ValueError(f"public path mismatch for {op['id']}")
        if item.get("operationId") != op["id"]:
            raise ValueError(f"operationId mismatch for {op['id']}")


def check_upstream(scope: str, xml: str) -> None:
    """Local structural validation of one exported scope. Not Azure validation.

    Only parsed elements count: comments are ignored by the parser, so a commented-out control is
    neither a control nor a violation. Anything able to alter credentials, set identity or end the
    request before the operation controls is rejected, because its effect cannot be determined
    without the effective policy evaluated in Azure.
    """
    if scope not in SCOPES:
        raise ValueError(f"unknown upstream scope {scope}")
    if re.search(r"<!(DOCTYPE|ENTITY)", xml, re.I):
        raise ValueError(f"{scope}: DTD/entities not allowed")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as error:
        raise ValueError(f"{scope}: unparseable policy") from error
    validate_policy(root, "upstream", scope)
    for element in root.iter():
        blob = " ".join([element.text or "", *element.attrib.values()]).lower()
        for marker in UPSTREAM_MARKERS:
            if marker in blob:
                raise ValueError(f"{scope}: inherited {marker}")


def _skeleton() -> ET.Element:
    root = ET.Element("policies")
    inbound = ET.SubElement(root, "inbound")
    ET.SubElement(inbound, "base")
    for name in SPOOFABLE:
        ET.SubElement(inbound, "set-header", name=name, **{"exists-action": "delete"})
    for section in ("backend", "outbound", "on-error"):
        ET.SubElement(root, section).append(ET.Element("base"))
    return root


def _text(root: ET.Element) -> str:
    ET.indent(root)
    return ET.tostring(root, encoding="unicode") + "\n"


def _deny(status: int, reason: str, code: str) -> ET.Element:
    response = ET.Element("return-response")
    ET.SubElement(response, "set-status", code=str(status), reason=reason)
    header = ET.SubElement(response, "set-header", name="Content-Type", **{"exists-action": "override"})
    ET.SubElement(header, "value").text = "application/json"
    ET.SubElement(response, "set-body").text = json.dumps({"error": {"code": code}}, separators=(",", ":"))
    return response


def _guard(condition: str, status: int, reason: str, code: str) -> ET.Element:
    choose = ET.Element("choose")
    ET.SubElement(choose, "when", condition=condition).append(_deny(status, reason, code))
    return choose


def _header(name: str) -> str:
    # Plain IReadOnlyDictionary members (ContainsKey + indexer), not APIM-specific GetValueOrDefault overloads.
    return (f'(context.Request.Headers.ContainsKey("{name}") ? context.Request.Headers["{name}"] : new string[0])')


def _cookie_header() -> str:
    return f'string.Join("; ", {_header("Cookie")})'


def _count(name: str) -> str:
    # Azure rejects System.Text.RegularExpressions.MatchCollection in policy expressions (verified on
    # markettec-api, 2026-11-09), so Regex.Matches(...).Count cannot be used. Regex.Split returns string[];
    # with a non-capturing pattern its length is the number of occurrences + 1.
    return f'(System.Text.RegularExpressions.Regex.Split({_cookie_header()}, @"(?:^|;\\s*){name}=").Length - 1)'


def _valid(name: str) -> str:
    return f'System.Text.RegularExpressions.Regex.IsMatch({_cookie_header()}, @"(^|;\\s*){name}={COOKIE_VALUE}(;|\\z)")'


def _csrf_invalid() -> str:
    return (f'{_header("X-CSRF-Token")}.Length != 1 || '
            f'!System.Text.RegularExpressions.Regex.IsMatch({_header("X-CSRF-Token")}[0], @"{CSRF_VALUE}")')


def checks_for(op: dict) -> list:
    """Cheap gateway checks. Cookie presence/format is never treated as authentication."""
    checks = []
    if op["origin"]:
        origin = _header("Origin")
        checks.append(_guard(
            f'@{{ var o = {origin}; return o.Length != 1 || o[0] == "" || o[0] == "null" || !"{{{{allowed-origins}}}}".Split(\',\').Contains(o[0]); }}',
            403, "Forbidden", "ORIGIN_DENIED"))
    for kind in op["cookies"]:
        name = COOKIE_NAMES[kind]
        if op["cookie_mode"] == "required":
            condition = f"@{{ return {_count(name)} != 1 || !{_valid(name)}; }}"
        else:
            condition = f"@{{ return {_count(name)} > 1 || ({_count(name)} == 1 && !{_valid(name)}); }}"
        checks.append(_guard(condition, 401, "Unauthorized", COOKIE_ERRORS[kind]))
    if op["csrf"] == "required":
        checks.append(_guard(f"@{{ return {_csrf_invalid()}; }}", 403, "Forbidden", "CSRF_INVALID"))
    elif op["csrf"] == "if_cookie":
        # Idempotent logout: no cookie means no CSRF demand and ms-users answers 204.
        present = " || ".join(f"{_count(COOKIE_NAMES[k])} == 1" for k in op["cookies"])
        checks.append(_guard(f"@{{ return ({present}) && ({_csrf_invalid()}); }}", 403, "Forbidden", "CSRF_INVALID"))
    return checks


def verify_approval(manifest: dict, name: str, ctx: dict) -> bool:
    """True only for a real evidence document bound to this backend, contract, environment and APIM revision.

    The generator cannot prove who produced the document; that needs GitHub review controls or an
    operator (see EXTERNAL_EVIDENCE). Invalid claims raise instead of silently staying blocked.
    """
    claim = manifest["approvals"][name]
    if claim is None:
        return False
    target = manifest["target"]
    if target["environment"] is None or target["apim_revision"] is None:
        raise ValueError(f"{name}: approval needs a target environment and APIM revision")
    directory = Path(ctx["evidence_dir"]).resolve()
    path = (directory / claim["evidence_file"])
    if path.is_symlink() or path.resolve().parent != directory or not path.is_file():
        raise ValueError(f"{name}: evidence document not found")
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != claim["evidence_sha256"]:
        raise ValueError(f"{name}: evidence hash mismatch")
    try:
        doc = json.loads(data)
    except ValueError as error:
        raise ValueError(f"{name}: evidence is not JSON") from error
    if not isinstance(doc, dict) or set(doc) != EVIDENCE_FIELDS or not all(isinstance(v, str) for v in doc.values()):
        raise ValueError(f"{name}: evidence needs exactly {sorted(EVIDENCE_FIELDS)}")
    if doc["approval_type"] != name:
        raise ValueError(f"{name}: evidence is for {doc['approval_type']}")
    if not BACKEND_SHA.fullmatch(doc["backend_sha"]) or doc["backend_sha"] != ctx["backend_sha"]:
        raise ValueError(f"{name}: evidence is for another ms-users backend")
    if doc["openapi_contract_version"] != ctx["openapi_version"]:
        raise ValueError(f"{name}: evidence is for another OpenAPI contract version")
    if not SHA256.fullmatch(doc["openapi_sha256"]) or doc["openapi_sha256"] != ctx["openapi_sha256"]:
        raise ValueError(f"{name}: evidence is for different OpenAPI file bytes")
    if doc["environment"] != target["environment"] or doc["apim_revision"] != target["apim_revision"]:
        raise ValueError(f"{name}: evidence is for another environment or APIM revision")
    if not TOKEN.fullmatch(doc["review_id"]):
        raise ValueError(f"{name}: invalid review id")
    return True


def blocked_reason(op: dict, approvals: dict):
    if op["anonymous_admission"] and not approvals["abuse_protection"]:
        return "abuse_protection_unapproved", "ADMISSION_DISABLED"
    if op["contract_status"] != "reconciled" and not approvals["ms_users_contract"]:
        return "ms_users_contract_unreconciled", "BACKEND_CONTRACT_PENDING"
    return None


def terminal_deny(code: str, status: int = 503, reason: str = "Service Unavailable") -> str:
    """No <base /> in inbound/backend/outbound: parent scopes and the backend are unreachable."""
    root = ET.Element("policies")
    ET.SubElement(root, "inbound").append(_deny(status, reason, code))
    ET.SubElement(root, "backend")
    ET.SubElement(root, "outbound")
    ET.SubElement(root, "on-error")
    return _text(root)


JWT_UNCONFIGURED = ("internal_jwt_unconfigured", "INTERNAL_JWT_UNCONFIGURED")


def _jwt_unconfigured(op: dict, jwt_unconfigured: bool):
    return JWT_UNCONFIGURED if jwt_unconfigured and op["auth"] in ("jwt", "jwt_cookie") else None


def _gateway_auth(inbound: ET.Element, op: dict, resource: str) -> None:
    """Last inbound steps of a forwarded operation: relocate the user JWT, then authenticate the gateway.

    `authentication-managed-identity` overwrites `Authorization`; for internal-JWT operations the token was already
    validated above and is copied to USER_TOKEN_HEADER (any client-supplied copy is overwritten). Every other
    operation deletes a client-supplied USER_TOKEN_HEADER, so it can never be smuggled to ms-users.
    """
    if op["auth"] in ("jwt", "jwt_cookie"):
        relocate = ET.SubElement(inbound, "set-header", name=USER_TOKEN_HEADER, **{"exists-action": "override"})
        ET.SubElement(relocate, "value").text = '@(context.Request.Headers.GetValueOrDefault("Authorization", ""))'
    else:
        ET.SubElement(inbound, "set-header", name=USER_TOKEN_HEADER, **{"exists-action": "delete"})
    ET.SubElement(inbound, "authentication-managed-identity", resource=resource)


def policy_for(op: dict, approvals: dict, jwks, issuer: str, audience: str, released=None,
               jwt_unconfigured: bool = False, gateway_resource=None) -> str:
    """`released`: operation ids of the release profile, or None when no profile narrows the surface.

    `jwt_unconfigured`: no reviewed JWKS/issuer/audience exist yet, so internal-JWT operations are denied.
    `gateway_resource`: Application ID URI the backend's Container Apps authentication expects, or None.
    """
    blocked = blocked_reason(op, approvals) or _jwt_unconfigured(op, jwt_unconfigured)
    if released is not None and op["id"] not in released:
        status, reason, code = NOT_RELEASED
        xml = terminal_deny(code, status, reason)
    elif blocked:
        xml = terminal_deny(blocked[1])
    else:
        if op["auth"] in ("jwt", "jwt_cookie"):
            if jwks is None:
                raise ValueError("jwks snapshot required for internal-JWT operations")
            root = ET.fromstring(build_jwt(jwks, issuer, audience))
        else:
            root = _skeleton()
        inbound = root.find("inbound")
        anchor = 1 + len(SPOOFABLE)  # after <base /> and identity-header removal
        for offset, check in enumerate(checks_for(op)):
            inbound.insert(anchor + offset, check)
        ET.SubElement(inbound, "rewrite-uri", template=op["backend_path"], **{"copy-unmatched-params": "true"})
        if gateway_resource is not None:
            _gateway_auth(inbound, op, gateway_resource)
        xml = _text(root)
    validate_policy(ET.fromstring(xml), "own")  # never emit our own policy without the local structure check
    return xml


def _prepare(manifest, openapi_bytes, backend_routes, evidence_dir):
    """`openapi_bytes` are the exact bytes of the contract used; evidence is bound to their SHA-256."""
    ops = validate(manifest)
    verify_reference(ops)
    if not isinstance(openapi_bytes, (bytes, bytearray)) or backend_routes is None:
        raise ValueError("openapi file bytes and backend routes are required")
    openapi = json.loads(openapi_bytes)
    verify_sources(manifest, openapi, backend_routes)
    ctx = {"evidence_dir": evidence_dir or EVIDENCE_DIR, "backend_sha": backend_routes.get("sha"),
           "openapi_version": openapi.get("info", {}).get("version"),
           "openapi_sha256": hashlib.sha256(openapi_bytes).hexdigest()}
    return ops, {name: verify_approval(manifest, name, ctx) for name in APPROVALS}


def _definitions(ops, manifest, approvals, jwks, issuer, audience, suffix, released=None, jwt_unconfigured=False,
                 gateway_resource=None):
    policies, definitions = {}, []
    for op in ops:
        xml = policy_for(op, approvals, jwks, issuer, audience, released, jwt_unconfigured, gateway_resource)
        blocked = blocked_reason(op, approvals) or _jwt_unconfigured(op, jwt_unconfigured)
        if released is not None and op["id"] not in released:
            blocked = ("not_in_release_profile", NOT_RELEASED[2])
        policies[op["id"]] = xml
        definitions.append({
            "id": op["id"], "method": op["method"], "url_template": op["public_path"],
            "backend": manifest["backend"], "backend_path": op["backend_path"],
            "classification": op["auth"], "policy_file": f"{op['id']}{suffix}",
            "policy_sha256": hashlib.sha256(xml.encode()).hexdigest(),
            "status": "blocked" if blocked else "enabled", "blocked_reasons": [blocked[0]] if blocked else []})
    return policies, definitions


def upstream_report(upstream_xml: dict, no_product_scope: bool = False) -> dict:
    """Validate every supplied scope locally; report which exports are still missing.

    `no_product_scope`: the operator verified in Azure that the API belongs to no product, so there is no
    product scope to export (supplying one anyway is contradictory and refused).
    """
    upstream_xml = upstream_xml or {}
    if set(upstream_xml) - set(SCOPES):
        raise ValueError("unknown upstream scope")
    if no_product_scope and "product" in upstream_xml:
        raise ValueError("a product export contradicts no_product_scope")
    for scope, xml in upstream_xml.items():
        check_upstream(scope, xml)
    required = [s for s in SCOPES if not (no_product_scope and s == "product")]
    return {"missing_exports": {s: REQUIRED_EXPORTS[s] for s in required if s not in upstream_xml},
            "validated": [s for s in SCOPES if s in upstream_xml],
            "product_scope": "none (operator-verified: API in no product)" if no_product_scope else "exported"}


# Placeholders only used to prove the route chain is internally consistent; real hosts are operator inputs.
PLACEHOLDER_GATEWAY = "https://apim-gateway.invalid"
PLACEHOLDER_USERS = "https://ms-users.invalid"


def api_scope_policy(spec: dict, allowed_origins: list) -> str:
    """Apply the ms-users API's credentialed CORS before inheriting parent policies."""
    if not allowed_origins or len(set(allowed_origins)) != len(allowed_origins) or not all(
            isinstance(o, str) and valid_https_origin(o) for o in allowed_origins):
        raise ValueError("release needs explicit, distinct https origins (no *, paths or credentials)")
    root = ET.Element("policies")
    inbound = ET.SubElement(root, "inbound")
    cors = ET.SubElement(inbound, "cors", **{"allow-credentials": "true", "terminate-unmatched-request": "true"})
    origins = ET.SubElement(cors, "allowed-origins")
    for origin in allowed_origins:
        ET.SubElement(origins, "origin").text = origin
    methods = ET.SubElement(cors, "allowed-methods", **{"preflight-result-max-age": "600"})
    for method in spec["cors_allowed_methods"]:
        ET.SubElement(methods, "method").text = method
    headers = ET.SubElement(cors, "allowed-headers")
    for header in spec["cors_allowed_headers"]:
        ET.SubElement(headers, "header").text = header
    ET.SubElement(inbound, "base")
    for section in ("backend", "outbound", "on-error"):
        ET.SubElement(root, section).append(ET.Element("base"))
    xml = _text(root)
    check_upstream("api", xml)  # same literal-only rules as any inherited API scope
    return xml


def release_bundle(name: str, definitions: list, allowed_origins: list) -> dict:
    """Candidate API definition + API-scope policy + resolved route chain for a release profile."""
    spec = release_profile(name)
    released = set(spec["operations"])
    enabled = [d for d in definitions if d["id"] in released]
    api = dict(spec["api"])
    if api["subscriptionRequired"] is not False or api["protocols"] != ["https"] or api["service_url_path"]:
        raise ValueError("release API must be https-only, keyless and forward to the bare ms-users origin")
    chain = resolve_routes(f"{PLACEHOLDER_GATEWAY}/{api['path'].strip('/').rsplit('/v1', 1)[0]}", PLACEHOLDER_GATEWAY,
                           api["path"], enabled, {d["id"]: PLACEHOLDER_USERS for d in enabled}, PLACEHOLDER_USERS)
    return {"profile": name, "operations": sorted(released),
            "api_definition": {**api, "serviceUrl": None, "applied_in_azure": False,
                               "note": "candidate; serviceUrl is the bare ms-users origin supplied by the operator"},
            "route_chain_placeholders": {"gateway": PLACEHOLDER_GATEWAY, "ms_users": PLACEHOLDER_USERS},
            "route_chain": chain, "api_scope_policy": api_scope_policy(spec, allowed_origins)}


def _result(kind, suffix, index, ops, manifest, approvals, report, jwks, issuer, audience, release=None,
            allowed_origins=None, jwt_unconfigured=False, gateway_resource=None):
    if gateway_resource is not None and not GATEWAY_RESOURCE.fullmatch(gateway_resource):
        raise ValueError("gateway resource must be api://<application id>")
    released = set(release_profile(release)["operations"]) if release else None
    policies, definitions = _definitions(ops, manifest, approvals, jwks, issuer, audience, suffix, released,
                                         jwt_unconfigured, gateway_resource)
    result = {"kind": kind, "index_file": index, "azure_validated": False, "deployment_approved": False,
              "local_structure_validated": True, "upstream_scopes_validated_locally": report["validated"],
              "missing_exports": report["missing_exports"], "product_scope": report["product_scope"],
              "internal_jwt": "unconfigured: JWT operations denied" if jwt_unconfigured else "configured",
              "gateway_auth": {"resource": gateway_resource, "user_token_header": USER_TOKEN_HEADER}
              if gateway_resource else None,
              "approvals_verified": approvals,
              "external_evidence_required": EXTERNAL_EVIDENCE, "policies": policies, "definitions": definitions}
    if release:
        bundle = release_bundle(release, definitions, allowed_origins)
        stem = "candidate" if kind == "candidate_package" else "analysis"
        scope_file = f"api-scope.{stem}.xml" if stem == "candidate" else "api-scope.xml.txt"
        result["extra_files"] = {scope_file: bundle.pop("api_scope_policy"),
                                 f"api-definition.{stem}.json": json.dumps(bundle["api_definition"], indent=2) + "\n"}
        result["release"] = bundle
    return result


def analyze(manifest, jwks, issuer, audience, upstream_xml=None, openapi=None, backend_routes=None, evidence_dir=None,
            release=None, allowed_origins=None, gateway_resource=None) -> dict:
    """Local review output (*.xml.txt). Never a package, whatever the inputs."""
    ops, approvals = _prepare(manifest, openapi, backend_routes, evidence_dir)
    report = upstream_report(upstream_xml)
    return _result("analysis", ".xml.txt", "operations.analysis.json", ops, manifest, approvals, report, jwks, issuer,
                   audience, release, allowed_origins, gateway_resource=gateway_resource)


def build_package(manifest, jwks, issuer, audience, upstream_xml=None, openapi=None, backend_routes=None, evidence_dir=None,
                  release=None, allowed_origins=None, jwt_unconfigured=False, no_product_scope=False,
                  gateway_resource=None) -> dict:
    """Candidate package (*.candidate.xml) or PackageError. Locally checked only; not Azure-validated or approved.

    `jwt_unconfigured` / `no_product_scope` build a partial staging package (release profile only): they never
    enable an operation, they only replace a missing input with a terminal deny or a verified absence.
    """
    if (jwt_unconfigured or no_product_scope) and not release:
        raise PackageError("partial staging packages need a release profile")
    ops, approvals = _prepare(manifest, openapi, backend_routes, evidence_dir)
    report = upstream_report(upstream_xml, no_product_scope)
    if report["missing_exports"]:
        raise PackageError("missing verified upstream policy exports: " + ", ".join(report["missing_exports"]))
    if jwt_unconfigured:
        if jwks is not None or issuer or audience:
            raise PackageError("jwt_unconfigured contradicts a supplied JWKS, issuer or audience")
    elif jwks is None or not issuer or not audience:
        raise PackageError("reviewed JWKS snapshot, issuer and audience are required")
    return _result("candidate_package", ".candidate.xml", "operations.candidate.json", ops, manifest, approvals, report,
                   jwks, issuer, audience, release, allowed_origins, jwt_unconfigured, gateway_resource)


def write_output(result: dict, output_dir: Path) -> None:
    """Write into a brand-new directory or not at all; a failure leaves no partial artifacts."""
    out = Path(output_dir)
    if out.exists() and (not out.is_dir() or any(out.iterdir())):
        raise FileExistsError(f"output directory {out} already exists and is not empty; use a new directory")
    out.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{out.name}.staging-", dir=out.parent))
    try:
        by_id = {d["id"]: d["policy_file"] for d in result["definitions"]}
        for name, xml in result["policies"].items():
            (staging / by_id[name]).write_text(xml)
        for name, text in result.get("extra_files", {}).items():
            (staging / name).write_text(text)
        meta = {k: v for k, v in result.items() if k not in ("policies", "index_file", "extra_files")}
        (staging / result["index_file"]).write_text(json.dumps(meta, indent=2) + "\n")
        if out.exists():
            out.rmdir()
        os.rename(staging, out)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("analyze", "package"), required=True)
    parser.add_argument("--manifest", type=Path, default=HERE / "operations.json")
    parser.add_argument("--openapi", type=Path, default=HERE / "../../contracts/openapi/users.json")
    parser.add_argument("--backend-routes", type=Path, default=HERE / "backend-routes.json")
    parser.add_argument("--evidence-dir", type=Path, default=EVIDENCE_DIR)
    parser.add_argument("--jwks", type=Path)
    parser.add_argument("--release", help="release profile from release_profiles.py (narrows the surface)")
    parser.add_argument("--allowed-origin", action="append", default=[],
                        help="exact https SPA origin for the release API-scope CORS (repeatable)")
    parser.add_argument("--issuer", default="")
    parser.add_argument("--audience", default="")
    parser.add_argument("--jwt-unconfigured", action="store_true",
                        help="package only, with --release: deny every internal-JWT operation (no JWKS/issuer/audience yet)")
    parser.add_argument("--no-product-scope", action="store_true",
                        help="package only, with --release: the API is verified to belong to no APIM product")
    for scope in SCOPES:
        parser.add_argument(f"--upstream-{scope}", type=Path, help=f"exported {scope}-scope policy XML")
    parser.add_argument("--gateway-auth-resource",
                        help="api://<app id> expected by the backend's Container Apps authentication (MTEC-12/D04)")
    parser.add_argument("--output-dir", type=Path, required=True, help="must not exist or be empty")
    args = parser.parse_args()
    try:
        if args.mode == "analyze" and (args.jwt_unconfigured or args.no_product_scope):
            raise ValueError("--jwt-unconfigured and --no-product-scope apply to --mode package only")
        if args.mode == "analyze" and (not args.issuer or not args.audience):
            raise ValueError("analyze needs --issuer and --audience")
        out = Path(args.output_dir)
        if out.exists() and (not out.is_dir() or any(out.iterdir())):
            raise FileExistsError(f"output directory {out} already exists and is not empty; use a new directory")
        upstream = {s: getattr(args, f"upstream_{s}").read_text() for s in SCOPES if getattr(args, f"upstream_{s}")}
        inputs = (json.loads(args.manifest.read_text()), json.loads(args.jwks.read_text()) if args.jwks else None,
                  args.issuer, args.audience, upstream, args.openapi.read_bytes(),
                  json.loads(args.backend_routes.read_text()), args.evidence_dir, args.release, args.allowed_origin)
        gateway = args.gateway_auth_resource
        result = (build_package(*inputs, jwt_unconfigured=args.jwt_unconfigured, no_product_scope=args.no_product_scope,
                                gateway_resource=gateway)
                  if args.mode == "package" else analyze(*inputs, gateway_resource=gateway))
        write_output(result, out)
    except (ValueError, OSError) as error:  # PackageError is a ValueError
        raise SystemExit(f"refused: {error}")


if __name__ == "__main__":
    main()
