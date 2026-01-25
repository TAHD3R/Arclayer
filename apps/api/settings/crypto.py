from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
from typing import Final

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_ENC_PREFIX: Final[str] = "enc:v1:"


def generate_master_key() -> bytes:
    return os.urandom(32)


def fingerprint_master_key(key: bytes) -> str:
    return hashlib.sha256(key).hexdigest()


def master_key_exists(path: Path) -> bool:
    try:
        return path.is_file()
    except OSError:
        return False


def load_master_key(path: Path) -> bytes:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise ValueError("master key file is empty")
    key = base64.urlsafe_b64decode(_add_b64_padding(raw.encode("utf-8")))
    if len(key) != 32:
        raise ValueError("master key must be 32 bytes")
    return key


def ensure_master_key(path: Path, *, provided_b64: str | None = None) -> tuple[bytes, str]:
    if master_key_exists(path):
        key = load_master_key(path)
        return key, fingerprint_master_key(key)

    if provided_b64 is None:
        key = generate_master_key()
        encoded = base64.urlsafe_b64encode(key).decode("utf-8").rstrip("=")
    else:
        key = base64.urlsafe_b64decode(_add_b64_padding(provided_b64.strip().encode("utf-8")))
        if len(key) != 32:
            raise ValueError("provided master key must be 32 bytes")
        encoded = provided_b64.strip().rstrip("=")

    path.parent.mkdir(parents=True, exist_ok=True)
    # Best-effort permission hardening (may be restricted on some platforms).
    try:
        fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.write("\n")
    except FileExistsError:
        key = load_master_key(path)
        return key, fingerprint_master_key(key)

    return key, fingerprint_master_key(key)


def encrypt_secret(value: str, *, key: bytes, aad: str) -> str:
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, value.encode("utf-8"), aad.encode("utf-8"))
    packed = nonce + ct
    return _ENC_PREFIX + base64.urlsafe_b64encode(packed).decode("utf-8").rstrip("=")


def decrypt_secret(value: str, *, key: bytes, aad: str) -> str:
    if not is_encrypted(value):
        return value
    raw = value[len(_ENC_PREFIX) :].strip()
    packed = base64.urlsafe_b64decode(_add_b64_padding(raw.encode("utf-8")))
    nonce = packed[:12]
    ct = packed[12:]
    aesgcm = AESGCM(key)
    pt = aesgcm.decrypt(nonce, ct, aad.encode("utf-8"))
    return pt.decode("utf-8")


def is_encrypted(value: str) -> bool:
    return isinstance(value, str) and value.startswith(_ENC_PREFIX)


def _add_b64_padding(raw: bytes) -> bytes:
    # urlsafe_b64decode requires proper padding.
    missing = (-len(raw)) % 4
    return raw + (b"=" * missing)
