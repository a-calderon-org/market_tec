"""Render the policy for the catalog staging API with a reviewed users JWKS."""
import argparse
import json
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_jwt_policy import build


def catalog_policy(jwks: dict, issuer: str, audience: str) -> str:
    root = ET.fromstring(build(jwks, issuer, audience))
    inbound = root.find("inbound")
    ET.SubElement(inbound, "rate-limit", calls="120", **{"renewal-period": "60"})
    for name in ("Cookie", "X-CSRF-Token", "X-MTEC-Authorization", "X-MTEC-Google-Authorization"):
        ET.SubElement(inbound, "set-header", name=name, **{"exists-action": "delete"})
    gateway = ET.SubElement(inbound, "set-header", name="X-MTEC-Catalog-Gateway-Key", **{"exists-action": "override"})
    ET.SubElement(gateway, "value").text = "{{catalog-stg-backend-key}}"
    outbound = ET.SubElement(root.find("outbound"), "set-header", name="Cache-Control", **{"exists-action": "override"})
    ET.SubElement(outbound, "value").text = "no-store"
    ET.indent(root)
    return ET.tostring(root, encoding="unicode") + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jwks", type=Path, required=True)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--audience", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = catalog_policy(json.loads(args.jwks.read_text(encoding="utf-8")), args.issuer, args.audience)
    args.output.write_text(result, encoding="utf-8")


if __name__ == "__main__":
    main()
