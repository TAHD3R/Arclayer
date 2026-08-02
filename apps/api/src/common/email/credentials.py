from __future__ import annotations

from src.config import Settings
from src.settings.crypto import decrypt_secret, encrypt_secret, is_encrypted, load_master_key, master_key_exists


class MailCredentialCryptoError(ValueError):
    """Raised when a persisted mail credential cannot be safely used."""


def encrypt_mail_credential(
    *,
    settings: Settings,
    provider_id: str,
    field: str,
    value: str,
) -> str:
    key = _load_mail_master_key(settings)
    return encrypt_secret(value, key=key, aad=_credential_aad(provider_id=provider_id, field=field))


def decrypt_mail_credential(
    *,
    settings: Settings,
    provider_id: str,
    field: str,
    value: str,
) -> str:
    if not is_encrypted(value):
        return value
    key = _load_mail_master_key(settings)
    try:
        return decrypt_secret(value, key=key, aad=_credential_aad(provider_id=provider_id, field=field))
    except (ValueError, UnicodeDecodeError) as exc:
        raise MailCredentialCryptoError("MAIL_CREDENTIAL_DECRYPTION_FAILED") from exc


def _load_mail_master_key(settings: Settings) -> bytes:
    path = settings.security.master_key_path
    if not master_key_exists(path):
        raise MailCredentialCryptoError("MAIL_CREDENTIAL_MASTER_KEY_MISSING")
    try:
        return load_master_key(path)
    except (OSError, ValueError) as exc:
        raise MailCredentialCryptoError("MAIL_CREDENTIAL_MASTER_KEY_INVALID") from exc


def _credential_aad(*, provider_id: str, field: str) -> str:
    return f"system:mail:{provider_id.strip().lower()}:{field.strip().lower()}"
