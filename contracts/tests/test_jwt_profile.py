"""Isolated contract oracle, never imported by services; not integration evidence.

Synthetic clocks are synchronized with zero issuance skew. This is not an
approved production clock bound. OpenSSL verifies fixture signatures only.
"""
from __future__ import annotations

import base64
import copy
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_auth_contracts import API_PATH, FIXTURES, load, validator


def decode(segment):
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def evaluate(api, fixture, case):
    """Return rejection reason for a fixture; no HTTP, state store or remote fetch."""
    encoded_header, encoded_claims, encoded_signature = case["token"].split(".")
    header, claims = (json.loads(decode(s)) for s in (encoded_header, encoded_claims))
    if not validator(api, "InternalAccessHeader").is_valid(header):
        return "header"
    if header["kid"] != fixture["jwk"]["kid"]:
        return "unknown-kid"
    if not validator(api, "PublicSigningKey").is_valid(fixture["jwk"]):
        return "key"
    if int.from_bytes(decode(fixture["jwk"]["n"]), "big").bit_length() != api["x-jwt-policy"]["rsaBits"]:
        return "key"
    with tempfile.TemporaryDirectory(prefix="mtec15-jwt-oracle-") as directory:
        root = Path(directory)
        (root / "public.pem").write_text(fixture["publicKeyPem"])
        (root / "signature").write_bytes(decode(encoded_signature))
        result = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", str(root / "public.pem"),
             "-signature", str(root / "signature")],
            input=f"{encoded_header}.{encoded_claims}".encode(), capture_output=True,
        )
    if result.returncode:
        return "signature"
    if not validator(api, "InternalAccessClaims").is_valid(claims):
        return "claims"
    if claims["iss"] != fixture["issuer"]:
        return "issuer"
    if claims["aud"] != fixture["audience"]:
        return "audience"
    now = case["now"]
    if not 0 < claims["exp"] - claims["iat"] <= api["x-jwt-policy"]["maximumNominalLifetimeSeconds"]:
        return "lifetime"
    if claims["iat"] > now or ("nbf" in claims and not claims["iat"] <= claims["nbf"] < claims["exp"]):
        return "time"
    if now >= claims["exp"] or now < claims.get("nbf", claims["iat"]):
        return "time"
    return "accepted"


class JwtProfileVectorsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if shutil.which("openssl") is None:
            raise RuntimeError("OpenSSL is required for JWT contract vectors; QA cannot silently skip them")
        cls.api = load(API_PATH)
        cls.fixture = load(FIXTURES / "jwt-profile-cases.json")

    def test_signed_vectors_and_expiration_boundaries(self):
        self.assertEqual(2048, int.from_bytes(decode(self.fixture["jwk"]["n"]), "big").bit_length())
        observed = set()
        for case in self.fixture["cases"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(case["expected"], evaluate(self.api, self.fixture, case))
                observed.add(case["expected"])
        self.assertTrue({"accepted", "header", "signature", "issuer", "audience", "unknown-kid", "claims", "lifetime", "time"} <= observed)

    def test_wrong_key_and_public_material_restrictions(self):
        valid = next(c for c in self.fixture["cases"] if c["expected"] == "accepted")
        for bits in (1024, 2047, 2049, 3072):
            fixture = copy.deepcopy(self.fixture)
            fixture["jwk"]["n"] = base64.urlsafe_b64encode((1 << (bits - 1)).to_bytes((bits + 7) // 8, "big")).decode().rstrip("=")
            self.assertEqual("key", evaluate(self.api, fixture, valid))
        fixture = copy.deepcopy(self.fixture)
        fixture["publicKeyPem"] = fixture["otherPublicKeyPem"]
        self.assertEqual("signature", evaluate(self.api, fixture, valid))
        for field in ("d", "p", "q", "dp", "dq", "qi", "oth", "k"):
            fixture = copy.deepcopy(self.fixture)
            fixture["jwk"][field] = "forbidden"
            self.assertEqual("key", evaluate(self.api, fixture, valid))


if __name__ == "__main__":
    unittest.main()
