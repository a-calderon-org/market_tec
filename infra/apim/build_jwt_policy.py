"""Build an APIM operation policy from an operator-reviewed public JWKS snapshot.

Attach only to an operation whose backend already verifies the internal JWT.
The script never fetches a key URL supplied by a token or deploys to Azure.
"""
import argparse
import base64
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET


def build(jwks: dict, issuer: str, audience: str) -> str:
    if not re.fullmatch(r"https://[^\s]{1,248}", issuer):
        raise ValueError("invalid issuer")
    if not re.fullmatch(r"[A-Za-z0-9:._/-]{1,256}", audience):
        raise ValueError("invalid audience")
    keys = jwks.get("keys")
    if not isinstance(keys, list) or not 1 <= len(keys) <= 16:
        raise ValueError("invalid public key set")
    root = ET.Element("policies")
    inbound = ET.SubElement(root, "inbound")
    ET.SubElement(inbound, "base")
    for name in ("X-User-Id", "X-Session-Id", "X-Authenticated-User"):
        ET.SubElement(inbound, "set-header", name=name, **{"exists-action": "delete"})
    check = ET.SubElement(inbound, "validate-jwt", **{
        "header-name": "Authorization", "require-scheme": "Bearer",
        "require-signed-tokens": "true", "require-expiration-time": "true",
        "clock-skew": "0", "failed-validation-httpcode": "401",
        "failed-validation-error-message": "Invalid internal token",
        "output-token-variable-name": "internalJwt"})
    signing = ET.SubElement(check, "issuer-signing-keys")
    seen = set()
    for key in keys:
        if not isinstance(key, dict) or set(key) != {"kty", "use", "alg", "kid", "n", "e"}:
            raise ValueError("unexpected or private JWK field")
        kid = key["kid"]
        if (key["kty"], key["use"], key["alg"]) != ("RSA", "sig", "RS256") or not isinstance(kid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", kid) or kid in seen:
            raise ValueError("invalid or duplicate signing key")
        seen.add(kid)
        for part in ("n", "e"):
            value = key[part]
            if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
                raise ValueError("invalid RSA value")
        try:
            modulus = int.from_bytes(base64.urlsafe_b64decode(key["n"] + "=="), "big")
            exponent = int.from_bytes(base64.urlsafe_b64decode(key["e"] + "=="), "big")
        except ValueError as error:
            raise ValueError("invalid RSA encoding") from error
        if not 2048 <= modulus.bit_length() <= 8192 or modulus % 2 != 1 or exponent < 65537 or exponent % 2 != 1:
            raise ValueError("invalid RSA key strength")
        ET.SubElement(signing, "key", id=kid, n=key["n"], e=key["e"])
    ET.SubElement(ET.SubElement(check, "audiences"), "audience").text = audience
    ET.SubElement(ET.SubElement(check, "issuers"), "issuer").text = issuer
    choice = ET.SubElement(inbound, "choose")
    invalid = ET.SubElement(choice, "when", condition='@{ var jwt = (Jwt)context.Variables["internalJwt"]; return jwt.Algorithm != "RS256" || jwt.Type != "at+jwt" || String.IsNullOrEmpty(jwt.Subject) || String.IsNullOrEmpty(jwt.Id) || !jwt.IssuedAt.HasValue || !jwt.ExpirationTime.HasValue || (jwt.ExpirationTime.Value - jwt.IssuedAt.Value).TotalSeconds > 240 || !jwt.Claims.ContainsKey("sid") || jwt.Claims["sid"].Length != 1 || String.IsNullOrEmpty(jwt.Claims["sid"][0]); }')
    response = ET.SubElement(invalid, "return-response")
    ET.SubElement(response, "set-status", code="401", reason="Unauthorized")
    ET.SubElement(response, "set-body").text = '{"error":{"code":"INVALID_TOKEN"}}'
    for section in ("backend", "outbound", "on-error"):
        ET.SubElement(root, section).append(ET.Element("base"))
    ET.indent(root)
    return ET.tostring(root, encoding="unicode") + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jwks", type=Path, required=True)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--audience", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(build(json.loads(args.jwks.read_text()), args.issuer, args.audience))


if __name__ == "__main__":
    main()
