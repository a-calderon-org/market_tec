"""Local structural validation of APIM policy documents.

This is a *local* approximation of the APIM policy grammar: section placement, cardinality,
child order and attributes of the elements this project allows. Passing it does NOT mean Azure
accepts or approves the policy; only importing into a gateway can show that.
"""
import re
import unicodedata
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

BOOL = {"true", "false"}
SECTIONS = ("inbound", "backend", "outbound", "on-error")


def _int(low, high):
    return ("int", low, high)


def _matches(check, value):
    if check is None:
        return True
    if isinstance(check, set):
        return value in check
    if isinstance(check, tuple):  # ("int", low, high): plain decimal digits only
        return bool(re.fullmatch(r"[0-9]{1,9}", value)) and check[1] <= int(value) <= check[2]
    return bool(check.fullmatch(value))


TOKEN = re.compile(r"[A-Za-z][A-Za-z0-9-]{0,63}")
HOST_LABEL = re.compile(r"[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?")
HTTP_METHOD = re.compile(r"GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS")
NAME = re.compile(r"[A-Za-z0-9._-]{1,64}")



SPEC = {
    "base": {"attrs": {}, "seq": [], "text": "none"},
    "cors": {"attrs": {"allow-credentials": (False, BOOL), "terminate-unmatched-request": (False, BOOL)},
             "seq": [("allowed-origins", 1, 1), ("allowed-methods", 0, 1), ("allowed-headers", 0, 1),
                     ("expose-headers", 0, 1)], "text": "none"},
    "allowed-origins": {"attrs": {}, "seq": [("origin", 1, None)], "text": "none"},
    "origin": {"attrs": {}, "seq": [], "text": "required"},  # shape checked in validate_policy
    "allowed-methods": {"attrs": {"preflight-result-max-age": (False, _int(0, 86400))}, "seq": [("method", 1, None)], "text": "none"},
    "method": {"attrs": {}, "seq": [], "text": "required", "text_re": HTTP_METHOD},
    "allowed-headers": {"attrs": {}, "seq": [("header", 1, None)], "text": "none"},
    "expose-headers": {"attrs": {}, "seq": [("header", 1, None)], "text": "none"},
    "header": {"attrs": {}, "seq": [], "text": "required", "text_re": TOKEN},
    "set-header": {"attrs": {"name": (True, re.compile(r".{1,128}")), "exists-action": (False, {"override", "skip", "append", "delete"})},
                   "seq": [("value", 0, None)], "text": "none"},
    "value": {"attrs": {}, "seq": [], "text": "required"},
    "set-variable": {"attrs": {"name": (True, NAME), "value": (True, None)}, "seq": [], "text": "none"},
    "choose": {"attrs": {}, "seq": [("when", 1, None), ("otherwise", 0, 1)], "text": "none"},
    "when": {"attrs": {"condition": (True, None)}, "bag": True, "text": "none"},
    "otherwise": {"attrs": {}, "bag": True, "text": "none"},
    "return-response": {"attrs": {"response-variable-name": (False, None)},
                        "seq": [("set-status", 0, 1), ("set-header", 0, None), ("set-body", 0, 1)], "text": "none"},
    "set-status": {"attrs": {"code": (True, _int(100, 599)), "reason": (True, None)}, "seq": [], "text": "none"},
    "set-body": {"attrs": {"template": (False, {"liquid", "none"})}, "seq": [], "text": "optional"},
    "forward-request": {"attrs": {"timeout": (False, _int(1, 300)), "timeout-ms": (False, _int(1, 300000)),
                                  "follow-redirects": (False, BOOL), "buffer-request-body": (False, BOOL),
                                  "buffer-response": (False, BOOL), "fail-on-error-status-code": (False, BOOL),
                                  "continue-timeout": (False, _int(0, 60))},
                        "seq": [], "text": "none", "exclusive": [("timeout", "timeout-ms")]},
    "rewrite-uri": {"attrs": {"template": (True, re.compile(r"/[A-Za-z0-9._{}/-]*")), "copy-unmatched-params": (False, BOOL)}, "seq": [], "text": "none"},
    "validate-jwt": {"attrs": {
        "header-name": (False, {"Authorization"}), "require-scheme": (False, {"Bearer"}),
        "require-signed-tokens": (False, BOOL), "require-expiration-time": (False, BOOL),
        "clock-skew": (False, _int(0, 300)), "failed-validation-httpcode": (False, _int(400, 599)),
        "failed-validation-error-message": (False, None), "output-token-variable-name": (False, NAME)},
        "seq": [("issuer-signing-keys", 1, 1), ("audiences", 1, 1), ("issuers", 1, 1)], "text": "none"},
    "issuer-signing-keys": {"attrs": {}, "seq": [("key", 1, None)], "text": "none"},
    "key": {"attrs": {"id": (True, NAME), "n": (True, re.compile(r"[A-Za-z0-9_-]+")), "e": (True, re.compile(r"[A-Za-z0-9_-]+"))}, "seq": [], "text": "none"},
    "audiences": {"attrs": {}, "seq": [("audience", 1, None)], "text": "none"},
    "audience": {"attrs": {}, "seq": [], "text": "required"},
    "issuers": {"attrs": {}, "seq": [("issuer", 1, None)], "text": "none"},
    "issuer": {"attrs": {}, "seq": [], "text": "required"},
    # Gateway -> ms-users service authentication (Entra token for the dedicated app registration only).
    "authentication-managed-identity": {"attrs": {"resource": (True, re.compile(r"api://[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))},
                                        "seq": [], "text": "none"},
}
# Policies a section may hold, per profile.
PROFILES = {
    "own": {"inbound": {"base", "cors", "set-header", "set-variable", "choose", "return-response", "validate-jwt",
                        "rewrite-uri", "authentication-managed-identity"},
            "backend": {"base", "forward-request"}, "outbound": {"base", "set-header"},
            "on-error": {"base", "set-header"}},
    # Upstream scopes are deliberately small: anything that could alter credentials, set identity or end
    # the request before the operation controls (choose, return-response, set-variable, ...) is not allowed.
    # set-header is denied outright: any inherited header write or delete could weaken protections such as
    # Cache-Control: no-store on authenticated responses, HSTS, X-Frame-Options or X-Content-Type-Options,
    # and a name allowlist cannot prove a given name/action/value is safe.
    "upstream": {"inbound": {"base", "cors"}, "backend": {"base", "forward-request"},
                 "outbound": {"base"}, "on-error": {"base"}},
}
NESTED_EXCLUDED = {"base", "cors", "validate-jwt", "rewrite-uri", "authentication-managed-identity"}
SECTION_MAX_ONE = {"base", "cors", "forward-request", "validate-jwt", "rewrite-uri", "authentication-managed-identity"}
DYNAMIC = re.compile(r"@\s*[({]|\{\{|\}\}|^\s*@")


def has_control_chars(value: str) -> bool:
    """True for any control, line/paragraph separator or NUL in a value already decoded by the XML parser."""
    return any(unicodedata.category(ch) in ("Cc", "Zl", "Zp") for ch in value)


def valid_https_origin(origin: str) -> bool:
    """Structured check: https, valid host, port 1..65535 (no leading zeros), and nothing else."""
    if has_control_chars(origin) or origin != origin.strip() or not origin.startswith("https://") or len(origin) > 300:
        return False
    try:
        parts = urlsplit(origin)
        port = parts.port  # raises ValueError for non-numeric or > 65535
        host = parts.hostname
    except ValueError:
        return False
    if (parts.scheme != "https" or parts.username is not None or parts.password is not None or parts.path
            or parts.query or parts.fragment or not host or "@" in parts.netloc or "[" in parts.netloc
            # urlsplit() reports empty query/fragment for a bare "?" or "#"; the whole string must be the origin.
            or origin != f"https://{parts.netloc}"):
        return False
    if port is not None and not 1 <= port <= 65535:
        return False
    labels = host.split(".")
    if len(host) > 253 or not all(HOST_LABEL.fullmatch(label) for label in labels):
        return False
    return parts.netloc == host + (f":{port}" if port is not None else "")  # rejects empty port, "08080", odd casing of nothing


def _check_element(el: ET.Element, allowed: set, where: str) -> None:
    spec = SPEC.get(el.tag)
    if spec is None:
        raise ValueError(f"{where}: unknown element <{el.tag}>")
    if el.tag not in allowed:
        raise ValueError(f"{where}: <{el.tag}> not allowed here")
    for name in el.attrib:
        if name not in spec["attrs"]:
            raise ValueError(f"{where}: <{el.tag}> unknown attribute {name}")
        if has_control_chars(el.attrib[name]):
            raise ValueError(f"{where}: <{el.tag}> {name} contains control characters")
    if spec["text"] != "none" and has_control_chars(el.text or ""):
        raise ValueError(f"{where}: <{el.tag}> text contains control characters")
    for name, (required, check) in spec["attrs"].items():
        if required and name not in el.attrib:
            raise ValueError(f"{where}: <{el.tag}> missing attribute {name}")
        if name in el.attrib and not _matches(check, el.attrib[name]):
            raise ValueError(f"{where}: <{el.tag}> invalid {name}")
    for group in spec.get("exclusive", []):
        if sum(name in el.attrib for name in group) > 1:
            raise ValueError(f"{where}: <{el.tag}> attributes {group} are mutually exclusive")
    text = (el.text or "").strip()
    if (spec["text"] == "none" and text) or (spec["text"] == "required" and not text):
        raise ValueError(f"{where}: <{el.tag}> invalid text")
    if "text_re" in spec and not spec["text_re"].fullmatch(el.text or ""):
        raise ValueError(f"{where}: <{el.tag}> invalid text")
    for child in el:
        if (child.tail or "").strip():
            raise ValueError(f"{where}: stray text in <{el.tag}>")
    if spec.get("bag"):
        if not len(el):
            raise ValueError(f"{where}: <{el.tag}> is empty")
        nested = allowed - NESTED_EXCLUDED
        for child in el:
            _check_element(child, nested, where)
        return
    tags = [c.tag for c in el]
    position = 0
    for child_tag, low, high in spec["seq"]:
        count = 0
        while position < len(tags) and tags[position] == child_tag:
            position += 1
            count += 1
        if count < low or (high is not None and count > high):
            raise ValueError(f"{where}: <{el.tag}> needs {low}..{high} <{child_tag}> in order")
    if position != len(tags):
        raise ValueError(f"{where}: <{el.tag}> has unexpected or misordered <{tags[position]}>")
    for child in el:
        _check_element(child, set(SPEC), where)
    if el.tag == "set-header":
        action = el.attrib.get("exists-action", "override")
        if (action == "delete") != (len(el) == 0):
            raise ValueError(f"{where}: set-header values must be absent exactly for delete")


def _check_upstream_content(root: ET.Element, where: str) -> None:
    """Inherited scopes may only carry literal, reviewed content: no expressions, no named values."""
    for element in root.iter():
        for value in [element.text or "", *element.attrib.values()]:
            if DYNAMIC.search(value):
                raise ValueError(f"{where}: <{element.tag}> contains an expression or named value")
        if element.tag == "cors":
            credentialed = element.attrib.get("allow-credentials") == "true"
            for origin in element.findall("./allowed-origins/origin"):
                text = origin.text or ""
                if text == "*":
                    if credentialed:
                        raise ValueError(f"{where}: credentialed CORS needs explicit https origins")
                elif not valid_https_origin(text):
                    raise ValueError(f"{where}: CORS origin must be a literal https origin (host[:port] only) or *")


def validate_policy(root: ET.Element, profile: str, scope: str = "own") -> None:
    """Raise ValueError unless `root` is a structurally valid <policies> document for the profile.

    scope: "own" (generated operation policy), "global", "product" or "api" (exported upstream).
    """
    where = scope
    if root.tag != "policies":
        raise ValueError(f"{where}: root must be <policies>")
    if root.attrib or (root.text or "").strip():
        raise ValueError(f"{where}: <policies> takes no attributes or text")
    if profile == "upstream":
        # Azure's default global policy has no <on-error>; at global scope there is nothing to inherit, so an
        # absent section means no actions. Every other scope must keep all four sections (and their <base />).
        tags = [c.tag for c in root]
        if tags != list(SECTIONS) and not (scope == "global" and tags == list(SECTIONS[:-1])):
            raise ValueError(f"{where}: expected sections {SECTIONS} exactly once and in order")
    else:
        tags = [c.tag for c in root]
        if tags != [s for s in SECTIONS if s in tags] or len(set(tags)) != len(tags) or "inbound" not in tags:
            raise ValueError(f"{where}: sections must be unique and ordered")
    for section in root:
        allowed = PROFILES[profile][section.tag]
        if section.attrib or (section.text or "").strip() or (section.tail or "").strip():
            raise ValueError(f"{where}: <{section.tag}> takes no attributes or text")
        names = [c.tag for c in section]
        for tag in SECTION_MAX_ONE:
            if names.count(tag) > 1:
                raise ValueError(f"{where}: more than one <{tag}> in {section.tag}")
        if section.tag == "backend" and (len(names) > 1 or (profile == "upstream" and not names)):
            raise ValueError(f"{where}: backend holds exactly one of <base /> or <forward-request />")
        if section.tag != "inbound" and "cors" in names:
            raise ValueError(f"{where}: <cors> only belongs in inbound")
        for child in section:
            if (child.tail or "").strip():
                raise ValueError(f"{where}: stray text in <{section.tag}>")
            if profile == "upstream" and child.tag == "set-header":
                raise ValueError(f"{where}: inherited scopes may not use <set-header> (could delete or weaken "
                                 "Cache-Control, HSTS, X-Frame-Options, X-Content-Type-Options or identity headers); "
                                 "remove it from the exported policy or review it in Azure")
            _check_element(child, allowed, where)
    if profile == "upstream":
        _check_upstream_content(root, where)
        bases = {s.tag: len(s.findall("./base")) for s in root}
        backend = [c.tag for c in root.find("backend")]
        if scope == "global":
            if any(bases.values()):
                raise ValueError("global: <base /> has no parent scope")
            if backend != ["forward-request"]:
                raise ValueError("global: backend must be exactly one <forward-request />")
        else:
            if set(bases.values()) != {1}:
                raise ValueError(f"{where}: every section needs exactly one <base /> so parent scopes keep applying")
            if backend != ["base"]:
                raise ValueError(f"{where}: backend must be exactly <base />")
