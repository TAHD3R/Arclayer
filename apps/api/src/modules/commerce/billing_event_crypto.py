from __future__ import annotations

import base64
from pathlib import Path

from cryptography.exceptions import InvalidTag

from src.settings.crypto import decrypt_secret, encrypt_secret, load_master_key, master_key_exists


class BillingEventCryptoError(RuntimeError):
    """The canonical master key cannot encrypt or decrypt a billing event."""


def encrypt_billing_event_payload(
    payload: bytes,
    *,
    key_path: Path,
    aad: str,
) -> str:
    key = _load_required_key(key_path)
    encoded = base64.b64encode(payload).decode("ascii")
    try:
        return encrypt_secret(encoded, key=key, aad=aad)
    except (TypeError, ValueError) as exc:
        raise BillingEventCryptoError("billing event payload encryption failed") from exc


def decrypt_billing_event_payload(
    encrypted_payload: str,
    *,
    key_path: Path,
    aad: str,
) -> bytes:
    key = _load_required_key(key_path)
    try:
        encoded = decrypt_secret(encrypted_payload, key=key, aad=aad)
        return base64.b64decode(encoded, validate=True)
    except (InvalidTag, TypeError, ValueError) as exc:
        raise BillingEventCryptoError("billing event payload decryption failed") from exc


def billing_event_aad(
    *,
    provider: str,
    provider_mode: str,
    provider_account_id: str,
    provider_event_id: str,
    connector_key: str,
    connector_version: str,
    payload_sha256: str,
) -> str:
    return ":".join((
        "connector-event",
        provider,
        provider_mode,
        provider_account_id,
        provider_event_id,
        connector_key,
        connector_version,
        payload_sha256,
    ))


def _load_required_key(key_path: Path) -> bytes:
    if not master_key_exists(key_path):
        raise BillingEventCryptoError("billing event master key is missing")
    try:
        return load_master_key(key_path)
    except (OSError, ValueError) as exc:
        raise BillingEventCryptoError("billing event master key is invalid") from exc
