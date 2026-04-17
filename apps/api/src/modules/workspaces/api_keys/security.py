from __future__ import annotations

import hmac
import secrets
from dataclasses import dataclass
from hashlib import sha256
from typing import Final

from src.models.workspaces.api_key import ApiKeyFamily

_PUBLIC_ID_BYTES: Final[int] = 6
_SECRET_BYTES: Final[int] = 24
_MASK_SUFFIX_LEN: Final[int] = 4
_TOKEN_SEPARATOR: Final[str] = "."
_API_KEY_PREFIXES: Final[dict[ApiKeyFamily, str]] = {
    ApiKeyFamily.PERSONAL_MANAGEMENT: "ark_mgmt_",
    ApiKeyFamily.WORKSPACE_SERVICE: "ark_ws_",
    ApiKeyFamily.DELIVERY: "ark_deliv_",
}


@dataclass(frozen=True)
class GeneratedApiKey:
    family: ApiKeyFamily
    public_id: str
    token: str
    token_hash: str
    token_mask: str


def get_api_key_prefix(family: ApiKeyFamily) -> str:
    return _API_KEY_PREFIXES[family]


def mint_api_key(*, family: ApiKeyFamily, pepper: bytes) -> GeneratedApiKey:
    public_id = secrets.token_hex(_PUBLIC_ID_BYTES)
    secret = secrets.token_hex(_SECRET_BYTES)
    token = f"{get_api_key_prefix(family)}{public_id}{_TOKEN_SEPARATOR}{secret}"
    return GeneratedApiKey(
        family=family,
        public_id=public_id,
        token=token,
        token_hash=hash_api_key_token(token=token, pepper=pepper),
        token_mask=mask_api_key_token(token=token),
    )


def hash_api_key_token(*, token: str, pepper: bytes) -> str:
    normalized = normalize_api_key_token(token)
    return hmac.new(pepper, normalized.encode("utf-8"), sha256).hexdigest()


def verify_api_key_token(*, token: str, pepper: bytes, expected_hash: str) -> bool:
    actual_hash = hash_api_key_token(token=token, pepper=pepper)
    return hmac.compare_digest(actual_hash, expected_hash)


def mask_api_key_token(*, token: str) -> str:
    normalized = normalize_api_key_token(token)
    family, public_id, secret = split_api_key_token(normalized)
    visible_suffix = secret[-_MASK_SUFFIX_LEN:]
    return f"{get_api_key_prefix(family)}{public_id}...{visible_suffix}"


def split_api_key_token(token: str) -> tuple[ApiKeyFamily, str, str]:
    normalized = normalize_api_key_token(token)
    for family, prefix in _API_KEY_PREFIXES.items():
        if not normalized.startswith(prefix):
            continue
        body = normalized.removeprefix(prefix)
        public_id, separator, secret = body.partition(_TOKEN_SEPARATOR)
        if public_id and separator == _TOKEN_SEPARATOR and secret:
            return family, public_id, secret
        raise ValueError("invalid api key token")
    raise ValueError("unknown api key token family")


def normalize_api_key_token(token: str) -> str:
    normalized = str(token or "").strip()
    if not normalized:
        raise ValueError("api key token is empty")
    return normalized
