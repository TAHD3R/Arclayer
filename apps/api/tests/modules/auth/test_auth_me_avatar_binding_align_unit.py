from __future__ import annotations

from dataclasses import dataclass, replace
from uuid import UUID, uuid4

import pytest


@dataclass(frozen=True, slots=True)
class _FakeUser:
    id: UUID
    username: str
    email: str | None
    display_name: str | None
    avatar_url: str | None
    avatar_asset_id: UUID | None
    is_super_admin: bool = False


@pytest.mark.asyncio
async def test_update_my_profile_sets_avatar_asset_aligned_flag(monkeypatch) -> None:
    from apps.api.src.config import get_settings
    from apps.api.src.models.assets.asset import AssetRecord
    from apps.api.src.modules.assets.admin.assets import binding_align
    from apps.api.src.modules.auth.schema import UpdateMyProfileRequest
    from apps.api.src.modules.auth.service import AuthService

    settings = get_settings()
    service = AuthService(settings)

    user = _FakeUser(
        id=uuid4(),
        username="u",
        email="u@example.com",
        display_name="u",
        avatar_url=None,
        avatar_asset_id=None,
        is_super_admin=False,
    )

    async def fake_patch_profile(u: _FakeUser, **kwargs):  # type: ignore[no-untyped-def]
        next_user = u
        if "avatar_asset_id" in kwargs:
            next_user = replace(next_user, avatar_asset_id=kwargs["avatar_asset_id"])
        if "avatar_url" in kwargs:
            next_user = replace(next_user, avatar_url=kwargs["avatar_url"])
        return next_user

    monkeypatch.setattr(service.user_repo, "patch_profile", fake_patch_profile, raising=True)
    expected_asset_id = uuid4()

    class _Asset:
        id = expected_asset_id

    async def fake_get_or_none(*_args, **_kwargs):
        return _Asset()

    async def fake_align_asset_for_binding(_settings, *, scope, asset_id, purpose):
        assert str(getattr(scope, "type", "")) == "user"
        assert UUID(str(scope.id)) == UUID(str(user.id))
        assert UUID(str(asset_id)) == expected_asset_id
        assert str(purpose) == "avatar"
        return True

    monkeypatch.setattr(AssetRecord, "get_or_none", fake_get_or_none, raising=True)
    monkeypatch.setattr(binding_align, "align_asset_for_binding", fake_align_asset_for_binding, raising=True)

    payload = UpdateMyProfileRequest(avatar_asset_id=expected_asset_id)
    out = await service.update_my_profile(user=user, payload=payload)  # type: ignore[arg-type]

    assert out.avatar_asset_id == expected_asset_id
    assert out.avatar_asset_aligned is True
