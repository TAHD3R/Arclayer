from __future__ import annotations

import pytest

from src.models.workspaces.api_key import ApiKeyFamily
from src.modules.workspaces.api_keys.security import (
    get_api_key_prefix,
    mask_api_key_token,
    mint_api_key,
    split_api_key_token,
    verify_api_key_token,
)


def test_mint_api_key_generates_prefixed_token_hash_and_mask() -> None:
    key = mint_api_key(family=ApiKeyFamily.PERSONAL_MANAGEMENT, pepper=b"pepper")

    assert key.token.startswith(get_api_key_prefix(ApiKeyFamily.PERSONAL_MANAGEMENT))
    assert key.token_mask.startswith(get_api_key_prefix(ApiKeyFamily.PERSONAL_MANAGEMENT))
    assert key.token_mask.endswith(key.token[-4:])
    assert len(key.token_hash) == 64


def test_verify_api_key_token_matches_expected_hash() -> None:
    key = mint_api_key(family=ApiKeyFamily.DELIVERY, pepper=b"pepper")

    assert verify_api_key_token(token=key.token, pepper=b"pepper", expected_hash=key.token_hash) is True
    assert verify_api_key_token(token=key.token, pepper=b"wrong", expected_hash=key.token_hash) is False


def test_split_api_key_token_returns_family_public_id_and_secret() -> None:
    key = mint_api_key(family=ApiKeyFamily.WORKSPACE_SERVICE, pepper=b"pepper")

    family, public_id, secret = split_api_key_token(key.token)

    assert family is ApiKeyFamily.WORKSPACE_SERVICE
    assert public_id == key.public_id
    assert secret
    assert mask_api_key_token(token=key.token).startswith(f"{get_api_key_prefix(family)}{public_id}")


def test_split_api_key_token_rejects_invalid_shape() -> None:
    with pytest.raises(ValueError, match="invalid api key token|unknown api key token family"):
        split_api_key_token("ark_mgmt_invalid-token")
