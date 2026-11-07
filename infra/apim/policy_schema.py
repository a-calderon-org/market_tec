"""Local structural validation of APIM policy documents.

This is a *local* approximation of the APIM policy grammar: section placement, cardinality,
child order and attributes of the elements this project allows. Passing it does NOT mean Azure
accepts or approves the policy; only importing into a gateway can show that.
"""
from xml.etree import ElementTree as ET

BOOL = {"true", "false"}
SECTIONS = ("inbound", "backend", "outbound", "on-error")
# tag -> attrs {name: (required, allowed values or None)}, seq [(child, min, max)], text rule
SPEC = {
    "base": {"attrs": {}, "seq": [], "text": "none"},
    "cors": {"attrs": {"allow-credentials": (False, BOOL), "terminate-unmatched-request": (False, BOOL)},
             "seq": [("allowed-origins", 1, 1), ("allowed-methods", 0, 1), ("allowed-headers", 0, 1),
                     ("expose-headers", 0, 1)], "text": "none"},
    "allowed-origins": {"attrs": {}, "seq": [("origin", 1, None)], "text": "none"},
    "origin": {"attrs": {}, "seq": [], "text": "required"},
    "allowed-methods": {"attrs": {"preflight-result-max-age": (False, None)}, "seq": [("method", 1, None)], "text": "none"},
    "method": {"attrs": {}, "seq": [], "text": "required"},
    "allowed-headers": {"attrs": {}, "seq": [("header", 1, None)], "text": "none"},
    "expose-headers": {"attrs": {}, "seq": [("header", 1, None)], "text": "none"},
    "header": {"attrs": {}, "seq": [], "text": "required"},
    "set-header": {"attrs": {"name": (True, None), "exists-action": (False, {"override", "skip", "append", "delete"})},
                   "seq": [("value", 0, None)], "text": "none"},
    "value": {"attrs": {}, "seq": [], "text": "required"},
    "set-variable": {"attrs": {"name": (True, None), "value": (True, None)}, "seq": [], "text": "none"},
    "choose": {"attrs": {}, "seq": [("when", 1, None), ("otherwise", 0, 1)], "text": "none"},
    "when": {"attrs": {"condition": (True, None)}, "bag": True, "text": "none"},
    "otherwise": {"attrs": {}, "bag": True, "text": "none"},
    "return-response": {"attrs": {"response-variable-name": (False, None)},
                        "seq": [("set-status", 0, 1), ("set-header", 0, None), ("set-body", 0, 1)], "text": "none"},
    "set-status": {"attrs": {"code": (True, None), "reason": (True, None)}, "seq": [], "text": "none"},
    "set-body": {"attrs": {"template": (False, {"liquid", "none"})}, "seq": [], "text": "optional"},
    "forward-request": {"attrs": {"timeout": (False, None), "follow-redirects": (False, BOOL),
                                  "buffer-request-body": (False, BOOL), "buffer-response": (False, BOOL),
                                  "fail-on-error-status-code": (False, BOOL), "continue-timeout": (False, None)},
                        "seq": [], "text": "none"},
    "trace": {"attrs": {"source": (True, None), "severity": (False, {"verbose", "information", "error"})},
              "seq": [("message", 1, 1)], "text": "none"},
    "message": {"attrs": {}, "seq": [], "text": "required"},
    "rewrite-uri": {"attrs": {"template": (True, None), "copy-unmatched-params": (False, BOOL)}, "seq": [], "text": "none"},
    "validate-jwt": {"attrs": {k: (False, None) for k in (
        "header-name", "require-scheme", "require-signed-tokens", "require-expiration-time", "clock-skew",
        "failed-validation-httpcode", "failed-validation-error-message", "output-token-variable-name")},
        "seq": [("issuer-signing-keys", 1, 1), ("audiences", 1, 1), ("issuers", 1, 1)], "text": "none"},
    "issuer-signing-keys": {"attrs": {}, "seq": [("key", 1, None)], "text": "none"},
    "key": {"attrs": {"id": (True, None), "n": (True, None), "e": (True, None)}, "seq": [], "text": "none"},
    "audiences": {"attrs": {}, "seq": [("audience", 1, None)], "text": "none"},
    "audience": {"attrs": {}, "seq": [], "text": "required"},
    "issuers": {"attrs": {}, "seq": [("issuer", 1, None)], "text": "none"},
    "issuer": {"attrs": {}, "seq": [], "text": "required"},
}
# Policies a section may hold, per profile.
PROFILES = {
    "own": {"inbound": {"base", "cors", "set-header", "set-variable", "choose", "return-response", "validate-jwt",
                        "rewrite-uri", "trace"},
            "backend": {"base", "forward-request"}, "outbound": {"base", "set-header", "trace"},
            "on-error": {"base", "set-header", "trace"}},
    # Upstream scopes are deliberately small: anything that could alter credentials, set identity or end
    # the request before the operation controls (choose, return-response, set-variable, ...) is not allowed.
    "upstream": {"inbound": {"base", "cors", "set-header", "trace"}, "backend": {"base", "forward-request"},
                 "outbound": {"base", "set-header", "trace"}, "on-error": {"base", "set-header", "trace"}},
}
NESTED_EXCLUDED = {"base", "cors", "validate-jwt", "rewrite-uri"}
# set-header names an inherited scope may never touch.
PROTECTED_HEADERS = {"authorization", "cookie", "set-cookie", "origin", "x-csrf-token", "x-user-id",
                     "x-session-id", "x-authenticated-user", "ocp-apim-subscription-key"}


def _check_element(el: ET.Element, allowed: set, where: str) -> None:
    spec = SPEC.get(el.tag)
    if spec is None:
        raise ValueError(f"{where}: unknown element <{el.tag}>")
    if el.tag not in allowed:
        raise ValueError(f"{where}: <{el.tag}> not allowed here")
    for name in el.attrib:
        if name not in spec["attrs"]:
            raise ValueError(f"{where}: <{el.tag}> unknown attribute {name}")
    for name, (required, values) in spec["attrs"].items():
        if required and name not in el.attrib:
            raise ValueError(f"{where}: <{el.tag}> missing attribute {name}")
        if values is not None and name in el.attrib and el.attrib[name] not in values:
            raise ValueError(f"{where}: <{el.tag}> invalid {name}")
    text = (el.text or "").strip()
    if (spec["text"] == "none" and text) or (spec["text"] == "required" and not text):
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


def validate_policy(root: ET.Element, profile: str, scope: str = "own") -> None:
    """Raise ValueError unless `root` is a structurally valid <policies> document for the profile.

    scope: "own" (generated operation policy), "global", "product" or "api" (exported upstream).
    """
    where = scope
    if root.tag != "policies":
        raise ValueError(f"{where}: root must be <policies>")
    if profile == "upstream":
        if [c.tag for c in root] != list(SECTIONS):
            raise ValueError(f"{where}: expected sections {SECTIONS} exactly once and in order")
    else:
        tags = [c.tag for c in root]
        if tags != [s for s in SECTIONS if s in tags] or len(set(tags)) != len(tags) or "inbound" not in tags:
            raise ValueError(f"{where}: sections must be unique and ordered")
    for section in root:
        allowed = PROFILES[profile][section.tag]
        if section.attrib or (section.text or "").strip():
            raise ValueError(f"{where}: <{section.tag}> takes no attributes or text")
        names = [c.tag for c in section]
        if names.count("base") > 1 or names.count("forward-request") > 1:
            raise ValueError(f"{where}: duplicate <base>/<forward-request> in {section.tag}")
        if section.tag == "backend" and (len(names) > 1 or (profile == "upstream" and not names)):
            raise ValueError(f"{where}: backend holds exactly one of <base /> or <forward-request />")
        if section.tag != "inbound" and "cors" in names:
            raise ValueError(f"{where}: <cors> only belongs in inbound")
        for child in section:
            _check_element(child, allowed, where)
            for header in child.iter("set-header"):
                if profile == "upstream" and header.attrib.get("name", "").lower() in PROTECTED_HEADERS:
                    raise ValueError(f"{where}: inherited scope modifies protected header {header.attrib['name']}")
    if profile == "upstream":
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
