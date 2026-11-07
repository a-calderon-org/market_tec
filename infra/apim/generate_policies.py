"""Generate APIM operation definitions and policies from operations.json (policy as code).

Fail-closed: any inconsistency aborts before output is written.
* Routes are cross-checked against OpenAPI (x-public-apim-path) and the ms-users
  controller route snapshot (backend-routes.json).
* Anonymous admission stays 503 until abuse_protection_verified is true.
* Operations tied to unreconciled ms-users contracts stay 503 until
  contract_reconciliation_verified is true.
* `<base />` cannot be skipped in APIM, so a definition is only "enabled" when the
  exported global/product/api policies were supplied and contain no JWT/Google validation.
* Cookies are only checked for presence/format; they never authenticate. Session
  and CSRF verification belong to ms-users.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET

from build_jwt_policy import build as build_jwt

HERE = Path(__file__).parent
AUTH = {"public", "cookie", "jwt", "jwt_cookie"}
COOKIE_NAMES = {"attempt": "__Host-mtec-attempt", "refresh": "__Host-mtec-refresh"}
COOKIE_ERRORS = {"attempt": "AUTH_PROOF_INVALID", "refresh": "REFRESH_INVALID"}
METHODS = {"GET", "POST", "PUT"}
SPOOFABLE = ("X-User-Id", "X-Session-Id", "X-Authenticated-User")
PATH = re.compile(r"/[A-Za-z0-9._{}/-]*")
ID = re.compile(r"[A-Za-z][A-Za-z0-9]{2,63}")
FIELDS = {"id", "method", "public_path", "backend_path", "auth", "cookies", "cookie_mode", "origin",
          "csrf", "anonymous_admission", "contract_status"}
UPSTREAM_FORBIDDEN = ("validate-jwt", "validate-azure-ad-token", "accounts.google.com", "openid-config")
COOKIE_VALUE = r"[A-Za-z0-9._~+/=-]{16,512}"
CSRF_VALUE = r"^[\x21-\x2B\x2D-\x7E]{1,256}$"


def _params(path: str) -> list:
    return re.findall(r"\{([A-Za-z0-9]+)\}", path)


def validate(manifest: dict) -> list:
    if manifest.get("version") != 2 or manifest.get("backend") != "ms-users":
        raise ValueError("unsupported manifest")
    for flag in ("abuse_protection_verified", "contract_reconciliation_verified"):
        if not isinstance(manifest.get(flag), bool):
            raise ValueError(f"{flag} must be boolean")
    if manifest.get("upstream_scopes") != ["global", "product", "api"]:
        raise ValueError("upstream scopes must be global, product, api")
    ops, ids, routes = manifest.get("operations"), set(), set()
    if not isinstance(ops, list) or not ops:
        raise ValueError("no operations")
    for op in ops:
        if set(op) != FIELDS:
            raise ValueError("unexpected operation fields")
        if not ID.fullmatch(str(op["id"])) or op["id"] in ids:
            raise ValueError("invalid or duplicate id")
        if op["method"] not in METHODS or op["auth"] not in AUTH:
            raise ValueError("invalid method or auth")
        for key in ("public_path", "backend_path"):
            if not PATH.fullmatch(str(op[key])) or ".." in op[key] or "//" in op[key]:
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
        if route in routes:
            raise ValueError("duplicate public route")
        ids.add(op["id"])
        routes.add(route)
    return ops


def verify_sources(manifest: dict, openapi: dict, backend_routes: dict) -> None:
    """Reject mappings that disagree with the OpenAPI contract or the real controllers."""
    ops = validate(manifest)
    java = {tuple(route) for route in backend_routes["routes"]}
    declared = {(op["method"], op["backend_path"]) for op in ops}
    if len(declared) != len(ops):
        raise ValueError("duplicate backend route")
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
    try:
        ET.fromstring(xml)
    except ET.ParseError as error:
        raise ValueError(f"unparseable {scope} policy") from error
    lowered = xml.lower()
    for marker in UPSTREAM_FORBIDDEN:
        if marker in lowered:
            raise ValueError(f"{scope} policy contains inherited {marker}")


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


def _cookie_count(name: str) -> str:
    return f'System.Text.RegularExpressions.Regex.Matches(context.Request.Headers.GetValueOrDefault("Cookie",""), @"(^|;\\s*){name}=").Count'


def _cookie_valid(name: str) -> str:
    return f'System.Text.RegularExpressions.Regex.IsMatch(context.Request.Headers.GetValueOrDefault("Cookie",""), @"(^|;\\s*){name}={COOKIE_VALUE}(;|$)")'


def _csrf_invalid() -> str:
    return f'!System.Text.RegularExpressions.Regex.IsMatch(context.Request.Headers.GetValueOrDefault("X-CSRF-Token",""), @"{CSRF_VALUE}")'


def checks_for(op: dict) -> list:
    """Cheap gateway checks. Cookie presence/format is never treated as authentication."""
    checks = []
    if op["origin"]:
        checks.append(_guard(
            '@{ var o = context.Request.Headers.GetValueOrDefault("Origin",""); return o == "" || !"{{allowed-origins}}".Split(\',\').Contains(o); }',
            403, "Forbidden", "ORIGIN_DENIED"))
    for kind in op["cookies"]:
        name = COOKIE_NAMES[kind]
        if op["cookie_mode"] == "required":
            condition = f"@{{ return {_cookie_count(name)} != 1 || !{_cookie_valid(name)}; }}"
        else:
            condition = f"@{{ return {_cookie_count(name)} > 1 || ({_cookie_count(name)} == 1 && !{_cookie_valid(name)}); }}"
        checks.append(_guard(condition, 401, "Unauthorized", COOKIE_ERRORS[kind]))
    if op["csrf"] == "required":
        checks.append(_guard(f"@{{ return {_csrf_invalid()}; }}", 403, "Forbidden", "CSRF_INVALID"))
    elif op["csrf"] == "if_cookie":
        # Idempotent logout: no cookie means no CSRF demand and ms-users answers 204.
        present = " || ".join(f"{_cookie_count(COOKIE_NAMES[k])} == 1" for k in op["cookies"])
        checks.append(_guard(f"@{{ return ({present}) && {_csrf_invalid()}; }}", 403, "Forbidden", "CSRF_INVALID"))
    return checks


def blocked_reason(op: dict, manifest: dict):
    if op["anonymous_admission"] and not manifest["abuse_protection_verified"]:
        return "abuse_protection_unverified", "ADMISSION_DISABLED"
    if op["contract_status"] != "reconciled" and not manifest["contract_reconciliation_verified"]:
        return "ms_users_contract_unreconciled", "BACKEND_CONTRACT_PENDING"
    return None


def policy_for(op: dict, manifest: dict, jwks, issuer: str, audience: str) -> str:
    blocked = blocked_reason(op, manifest)
    if blocked:
        root = _skeleton()
        root.find("inbound").append(_deny(503, "Service Unavailable", blocked[1]))
        return _text(root)
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
    return _text(root)


def generate(manifest: dict, jwks, issuer: str, audience: str, upstream_xml: dict = None,
             openapi: dict = None, backend_routes: dict = None) -> dict:
    """Return {"policies": {id: xml}, "definitions": [...]}."""
    ops = validate(manifest)
    if (openapi is None) != (backend_routes is None):
        raise ValueError("openapi and backend routes must be supplied together")
    if openapi is not None:
        verify_sources(manifest, openapi, backend_routes)
    upstream_xml = upstream_xml or {}
    if set(upstream_xml) - set(manifest["upstream_scopes"]):
        raise ValueError("unknown upstream scope")
    for scope, xml in upstream_xml.items():
        check_upstream(scope, xml)
    upstream_verified = set(upstream_xml) == set(manifest["upstream_scopes"])
    policies, definitions = {}, []
    for op in ops:
        xml = policy_for(op, manifest, jwks, issuer, audience)
        policies[op["id"]] = xml
        reasons = []
        blocked = blocked_reason(op, manifest)
        if blocked:
            reasons.append(blocked[0])
        if not upstream_verified:
            reasons.append("inherited_policy_scopes_unverified")
        definitions.append({
            "id": op["id"], "method": op["method"], "url_template": op["public_path"],
            "backend": manifest["backend"], "backend_path": op["backend_path"],
            "classification": op["auth"], "policy_file": f"{op['id']}.xml",
            "policy_sha256": hashlib.sha256(xml.encode()).hexdigest(),
            "status": "blocked" if reasons else "enabled", "blocked_reasons": reasons})
    return {"policies": policies, "definitions": definitions}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=HERE / "operations.json")
    parser.add_argument("--openapi", type=Path, default=HERE / "../../contracts/openapi/users.json")
    parser.add_argument("--backend-routes", type=Path, default=HERE / "backend-routes.json")
    parser.add_argument("--jwks", type=Path)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--audience", required=True)
    for scope in ("global", "product", "api"):
        parser.add_argument(f"--upstream-{scope}", type=Path, help=f"exported {scope}-scope policy XML")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    upstream = {s: getattr(args, f"upstream_{s}").read_text() for s in ("global", "product", "api") if getattr(args, f"upstream_{s}")}
    result = generate(json.loads(args.manifest.read_text()),
                      json.loads(args.jwks.read_text()) if args.jwks else None, args.issuer, args.audience, upstream,
                      json.loads(args.openapi.read_text()), json.loads(args.backend_routes.read_text()))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, xml in result["policies"].items():
        (args.output_dir / f"{name}.xml").write_text(xml)
    (args.output_dir / "operations.generated.json").write_text(json.dumps(result["definitions"], indent=2) + "\n")


if __name__ == "__main__":
    main()
