from __future__ import annotations

import uuid

import pytest

from apps.api.src.config import get_settings
from apps.api.src.core.exceptions import Unauthorized
from apps.api.src.modules.auth.security import hash_password
from apps.api.src.modules.auth.service import AuthService
from apps.api.src.modules.organization.models.user import User, UserCredential, UserStatus

pytestmark = pytest.mark.integration


async def test_auth_login_refresh_integration(
    monkeypatch,
    db_schema,
    valkey_client,
) -> None:
    _ = db_schema
    client, _ = valkey_client
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    settings = get_settings()

    user = None
    try:
        password = "pass1234"
        user = await User.create(
            username=f"demo_{uuid.uuid4().hex}",
            email=None,
            status=UserStatus.ACTIVE,
            display_name="Demo",
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=hash_password(password, settings.auth))

        service = AuthService(settings, valkey=client)
        tokens = await service.login(identifier=user.username, password=password)
        assert tokens.access_token
        assert tokens.refresh_token

        rotated = await service.refresh(refresh_token=tokens.refresh_token)
        assert rotated.refresh_token != tokens.refresh_token

        with pytest.raises(Unauthorized):
            await service.refresh(refresh_token=tokens.refresh_token)

        await user.refresh_from_db()
        assert user.token_version == 1
    finally:
        if user is not None:
            await UserCredential.filter(user_id=user.id).delete()
            await User.filter(id=user.id).delete()
