from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
from typing import Final

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, PublicFormat

_PUB_PREFIX: Final[str] = "ed25519:pub:v1:"
_PRIV_PREFIX: Final[str] = "ed25519:priv:v1:"


def _add_b64_padding(raw: bytes) -> bytes:
    missing = (-len(raw)) % 4
    return raw + (b"=" * missing)


def fingerprint_key_bytes(key_bytes: bytes) -> str:
    return hashlib.sha256(key_bytes).hexdigest()


def generate_signing_keypair() -> tuple[bytes, bytes]:
    """
    Generate an Ed25519 signing keypair.

    Returns:
        (private_key_raw, public_key_raw), both 32 bytes.
    """

    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()
    priv_raw = priv.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    pub_raw = pub.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return priv_raw, pub_raw


def load_private_key(path: Path) -> Ed25519PrivateKey:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise ValueError("signing private key file is empty")
    if not raw.startswith(_PRIV_PREFIX):
        raise ValueError("unsupported signing private key format")
    packed = raw[len(_PRIV_PREFIX) :].strip()
    priv_raw = base64.urlsafe_b64decode(_add_b64_padding(packed.encode("utf-8")))
    if len(priv_raw) != 32:
        raise ValueError("ed25519 private key must be 32 bytes (raw)")
    return Ed25519PrivateKey.from_private_bytes(priv_raw)


def load_public_key(path: Path) -> Ed25519PublicKey:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise ValueError("signing public key file is empty")
    if not raw.startswith(_PUB_PREFIX):
        raise ValueError("unsupported signing public key format")
    packed = raw[len(_PUB_PREFIX) :].strip()
    pub_raw = base64.urlsafe_b64decode(_add_b64_padding(packed.encode("utf-8")))
    if len(pub_raw) != 32:
        raise ValueError("ed25519 public key must be 32 bytes (raw)")
    return Ed25519PublicKey.from_public_bytes(pub_raw)


def signing_keypair_exists(private_path: Path, public_path: Path) -> bool:
    try:
        return private_path.is_file() and public_path.is_file()
    except OSError:
        return False


def ensure_signing_keypair(
    *,
    private_path: Path,
    public_path: Path,
) -> tuple[Ed25519PrivateKey, Ed25519PublicKey, str]:
    """
    Ensure a signing keypair exists on disk.

    Returns:
        (private_key, public_key, public_fingerprint)
    """

    if signing_keypair_exists(private_path, public_path):
        priv = load_private_key(private_path)
        pub = load_public_key(public_path)
        pub_raw = pub.public_bytes(Encoding.Raw, PublicFormat.Raw)
        return priv, pub, fingerprint_key_bytes(pub_raw)

    private_path.parent.mkdir(parents=True, exist_ok=True)
    public_path.parent.mkdir(parents=True, exist_ok=True)

    priv_raw, pub_raw = generate_signing_keypair()
    priv_line = _PRIV_PREFIX + base64.urlsafe_b64encode(priv_raw).decode("utf-8").rstrip("=")
    pub_line = _PUB_PREFIX + base64.urlsafe_b64encode(pub_raw).decode("utf-8").rstrip("=")

    # Best-effort permission hardening for private key.
    # Note: some platforms/containers may restrict chmod/open flags.
    try:
        fd = os.open(str(private_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(priv_line)
            handle.write("\n")
    except FileExistsError:
        # Race: someone else created it; load the existing.
        priv = load_private_key(private_path)
        pub = load_public_key(public_path)
        pub_existing = pub.public_bytes(Encoding.Raw, PublicFormat.Raw)
        return priv, pub, fingerprint_key_bytes(pub_existing)

    # Public key can be world-readable.
    try:
        fd = os.open(str(public_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(pub_line)
            handle.write("\n")
    except FileExistsError:
        pass

    priv = Ed25519PrivateKey.from_private_bytes(priv_raw)
    pub = Ed25519PublicKey.from_public_bytes(pub_raw)
    return priv, pub, fingerprint_key_bytes(pub_raw)


def sign_detached(payload: bytes, *, private_key: Ed25519PrivateKey) -> str:
    sig = private_key.sign(payload)
    return base64.urlsafe_b64encode(sig).decode("utf-8").rstrip("=")


def verify_detached(payload: bytes, *, signature_b64: str, public_key: Ed25519PublicKey) -> bool:
    try:
        sig = base64.urlsafe_b64decode(_add_b64_padding(signature_b64.strip().encode("utf-8")))
        public_key.verify(sig, payload)
        return True
    except Exception:
        return False
