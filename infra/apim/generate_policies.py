"""Generate per-operation APIM policies from operations.json (policy as code).

Fail-closed: any manifest error aborts before output is written. Operations that
admit anonymous traffic stay blocked until abuse_protection_verified is true.
Inheritance: each section has exactly one <base />; internal-JWT operations rely
on build_jwt_policy (RS256, fixed issuer/audience) and never on Google validation.
"""
import argparse
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET

from build_jwt_policy import build as build_jwt

AUTH = {"public", "cookie", "jwt", "jwt_cookie"}
COOKIES = {"attempt", "refresh"}
METHODS = {"GET", "POST", "PUT"}
SPOOFABLE = ("X-User-Id", "X-Session-Id", "X-Authenticated-User")
PATH = re.compile(r"/[A-Za-z0-9._{}/-]*")
ID = re.compile(r"[A-Za-z][A-Za-z0-9]{2,63}")


def validate(manifest: dict) -> list:
    if manifest.get("version") != 1 or manifest.get("backend") != "ms-users":
        raise ValueError("unsupported manifest")
    if not isinstance(manifest.get("abuse_protection_verified"), bool):
        raise ValueError("abuse_protection_verified must be boolean")
    ops, ids, routes = manifest.get("operations"), set(), set()
    if not isinstance(ops, list) or not ops:
        raise ValueError("no operations")
    for op in ops:
        if set(op) != {"id", "method", "path", "backend_path", "auth", "cookies", "anonymous_admission"}:
            raise ValueError("unexpected operation fields")
        if not ID.fullmatch(str(op["id"])) or op["id"] in ids:
            raise ValueError("invalid or duplicate id")
        if op["method"] not in METHODS or op["auth"] not in AUTH:
            raise ValueError("invalid method or auth")
        for key in ("path", "backend_path"):
            if not PATH.fullmatch(str(op[key])) or ".." in op[key] or "//" in op[key]:
                raise ValueError("invalid path")
        if not isinstance(op["cookies"], list) or not set(op["cookies"]) <= COOKIES:
            raise ValueError("invalid cookies")
        if not isinstance(op["anonymous_admission"], bool):
            raise ValueError("invalid admission flag")
        if op["auth"] in ("jwt", "jwt_cookie") and op["anonymous_admission"]:
            raise ValueError("jwt operation cannot admit anonymous traffic")
        if op["auth"] in ("cookie", "jwt_cookie") and not op["cookies"]:
            raise ValueError("cookie operation without cookie")
        if op["auth"] in ("public", "jwt") and op["cookies"]:
            raise ValueError("unexpected cookies")
        route = (op["method"], op["path"])
        if route in routes:
            raise ValueError("duplicate route")
        ids.add(op["id"])
        routes.add(route)
    return ops


def _skeleton(inbound_extra=None) -> ET.Element:
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


def blocked_policy() -> str:
    root = _skeleton()
    response = ET.SubElement(root.find("inbound"), "return-response")
    ET.SubElement(response, "set-status", code="503", reason="Service Unavailable")
    ET.SubElement(response, "set-header", name="Content-Type", **{"exists-action": "override"}).append(
        _value("application/json"))
    ET.SubElement(response, "set-body").text = '{"error":{"code":"ADMISSION_DISABLED"}}'
    return _text(root)


def _value(text: str) -> ET.Element:
    element = ET.Element("value")
    element.text = text
    return element


def policy_for(op: dict, manifest: dict, jwks, issuer: str, audience: str) -> str:
    if op["anonymous_admission"] and not manifest["abuse_protection_verified"]:
        return blocked_policy()
    if op["auth"] in ("jwt", "jwt_cookie"):
        if jwks is None:
            raise ValueError("jwks snapshot required for internal-JWT operations")
        return build_jwt(jwks, issuer, audience)
    return _text(_skeleton())


def generate(manifest: dict, jwks, issuer: str, audience: str) -> dict:
    ops = validate(manifest)
    return {op["id"]: policy_for(op, manifest, jwks, issuer, audience) for op in ops}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path(__file__).with_name("operations.json"))
    parser.add_argument("--jwks", type=Path)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--audience", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    jwks = json.loads(args.jwks.read_text()) if args.jwks else None
    policies = generate(json.loads(args.manifest.read_text()), jwks, args.issuer, args.audience)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, xml in policies.items():
        (args.output_dir / f"{name}.xml").write_text(xml)


if __name__ == "__main__":
    main()
