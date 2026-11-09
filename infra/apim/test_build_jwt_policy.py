import unittest
import base64
from pathlib import Path
from xml.etree import ElementTree as ET

from build_jwt_policy import build


class PolicyTest(unittest.TestCase):
    def setUp(self):
        self.key = {"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "key1",
                    "n": base64.urlsafe_b64encode(bytes([128]) + bytes(254) + bytes([1])).decode().rstrip("="), "e": "AQAB"}

    def test_public_rsa_and_explicit_validation(self):
        xml = build({"keys": [self.key]}, "https://users.example.com", "markettec-api")
        root = ET.fromstring(xml)
        policy = root.find("./inbound/validate-jwt")
        self.assertEqual("0", policy.attrib["clock-skew"])
        self.assertEqual("Bearer", policy.attrib["require-scheme"])
        self.assertEqual("key1", policy.find("./issuer-signing-keys/key").attrib["id"])
        self.assertEqual("markettec-api", policy.find("./audiences/audience").text)
        self.assertNotIn("openid-config", xml)
        self.assertNotIn("rate-limit-by-key", xml)

    def test_rejects_private_and_duplicate_material(self):
        with self.assertRaises(ValueError):
            build({"keys": [dict(self.key, d="secret")]}, "https://users.example.com", "markettec-api")
        with self.assertRaises(ValueError):
            build({"keys": [self.key, self.key]}, "https://users.example.com", "markettec-api")

    def test_public_and_cookie_policies_keep_credentials_and_strip_spoofed_identity(self):
        for name in ("public-metadata.xml", "cookie-session.xml"):
            root = ET.parse(Path(__file__).with_name(name)).getroot()
            self.assertIsNotNone(root.find("./inbound/base"))
            names = {item.attrib["name"] for item in root.findall("./inbound/set-header")}
            self.assertEqual({"X-User-Id", "X-Session-Id", "X-Authenticated-User"}, names)
            self.assertIsNone(root.find("./inbound/validate-jwt"))


if __name__ == "__main__":
    unittest.main()
