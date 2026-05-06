from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Forbidden
from src.models.projects.api_key import ApiKeyFamily, DeliveryKeyPerspective
from src.modules.auth.content_api.service import ContentApiAuthService, extract_content_api_token
from src.modules.projects.api_keys.repository import ProjectApiKeysRepository
from src.modules.projects.api_keys.security import mint_api_key
from src.settings.crypto import ensure_master_key


class _CredentialRecordLike:
    id: object


class _Repo:
    def __init__(self, record):
        self.record = record
        self.updated_fields = None

    async def get_key_by_public_id(self, *, token_public_id: str):
        if token_public_id == self.record.token_public_id:
            return self.record
        return None

    async def update_key(self, record, *, fields: dict):
        self.updated_fields = fields
        for key, value in fields.items():
            setattr(record, key, value)
        return record


def _record(*, site_id, token_public_id: str, token_hash: str, scopes: list[str]):
    return SimpleNamespace(
        id=uuid4(),
        site_id=site_id,
        key_family=ApiKeyFamily.DELIVERY,
        delivery_perspective=DeliveryKeyPerspective.PUBLISHED,
        token_public_id=token_public_id,
        token_hash=token_hash,
        scopes=scopes,
        revoked_at=None,
        expires_at=datetime.now(tz=UTC) + timedelta(days=1),
    )


def _request(headers: dict[str, str]):
    return SimpleNamespace(headers=headers)


@pytest.mark.asyncio
async def test_content_api_auth_accepts_delivery_key_for_site(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    pepper, _fingerprint = ensure_master_key(get_settings().security.master_key_path)
    site_id = uuid4()
    generated = mint_api_key(family=ApiKeyFamily.DELIVERY, pepper=pepper)
    repo = _Repo(
        _record(
            site_id=site_id,
            token_public_id=generated.public_id,
            token_hash=generated.token_hash,
            scopes=["delivery.read"],
        )
    )

    service = ContentApiAuthService(get_settings(), repo=cast(ProjectApiKeysRepository, repo))
    credential = await service.authenticate_optional_delivery_key(
        request=_request({"x-api-key": generated.token}),
        site_id=site_id,
        required_action="project:delivery:read",
    )

    assert credential is not None
    assert cast(_CredentialRecordLike, credential.record).id == repo.record.id
    assert "project:delivery:read" in credential.granted_actions
    assert repo.updated_fields is not None
    assert set(repo.updated_fields) == {"last_used_at"}


def test_content_api_token_extractor_rejects_conflicting_headers() -> None:
    with pytest.raises(Forbidden) as exc:
        extract_content_api_token(
            _request({
                "x-api-key": "ark_deliv_one.secret",
                "authorization": "Bearer ark_deliv_two.secret",
            })
        )

    assert exc.value.error == "API_KEY_CONFLICT"
