import json
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from staging.build_catalog_policy import catalog_policy


class CatalogStagingPolicyTest(unittest.TestCase):
    def test_catalog_v2_uses_an_explicit_gateway_named_value(self):
        fixture = Path(__file__).parent / "staging/jwks/stg-jwt-2026-11.json"
        keys = json.loads(fixture.read_text())
        issuer = "https://identity.example.test/users"
        root = ET.fromstring(catalog_policy(keys, issuer, "catalog", "catalog-v2-backend-key"))
        self.assertEqual(issuer, root.findtext("./inbound/validate-jwt/issuers/issuer"))
        self.assertEqual("catalog", root.findtext("./inbound/validate-jwt/audiences/audience"))
        self.assertEqual("{{catalog-v2-backend-key}}", root.findtext(
            "./inbound/set-header[@name='X-MTEC-Catalog-Gateway-Key']/value"))
        with self.assertRaises(ValueError):
            catalog_policy(keys, issuer, "catalog", "bad}}value")

    def test_gateway_credential_is_injected_after_user_validation(self):
        fixture = Path(__file__).parent / "staging/jwks/stg-jwt-2026-11.json"
        issuer = "https://markettec-api.azure-api.net/users"
        root = ET.fromstring(catalog_policy(json.loads(fixture.read_text()), issuer, "markettec-api"))
        inbound = list(root.find("inbound"))
        check = root.find("./inbound/validate-jwt")
        self.assertEqual("Authorization", check.get("header-name"))
        self.assertEqual("0", check.get("clock-skew"))
        self.assertEqual(issuer, check.findtext("./issuers/issuer"))
        gateway = root.find("./inbound/set-header[@name='X-MTEC-Catalog-Gateway-Key']")
        self.assertGreater(inbound.index(gateway), inbound.index(check))
        self.assertEqual("override", gateway.get("exists-action"))
        self.assertEqual("{{catalog-stg-backend-key}}", gateway.findtext("value"))
        self.assertEqual("delete", root.find("./inbound/set-header[@name='Cookie']").get("exists-action"))
        self.assertEqual("no-store", root.findtext("./outbound/set-header[@name='Cache-Control']/value"))


if __name__ == "__main__":
    unittest.main()
