from __future__ import annotations

import os
import uuid

import pytest
from fastapi import FastAPI
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.core.database.valkey import close_valkey, init_valkey
from apps.api.core.exceptions import Unauthorized
from apps.api.models.user import User, UserCredential, UserStatus
from apps.api.routers.v1.auth.security import hash_password
from apps.api.routers.v1.auth.services import AuthService


def _integration_enabled() -> bool:
    return os.getenv("RUN_INTEGRATION_TESTS") == "1"


async def test_auth_login_refresh_integration(monkeypatch) -> None:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    prefix = f"test:auth:{uuid.uuid4().hex}"
    monkeypatch.setenv("DATABASE__ENABLED", "1")
    monkeypatch.setenv("VALKEY__ENABLED", "1")
    monkeypatch.setenv("VALKEY__PREFIX", prefix)
    monkeypatch.setenv("JWT_SECRET", "test-secret")

    settings = get_settings()
    app = FastAPI()

    await init_valkey(app, settings)
    await init_orm(settings)
    await verify_db_ready(settings)
    await Tortoise.generate_schemas(safe=True)

    user = None
    try:
        password = "pass123"
        user = await User.create(
            username=f"demo_{uuid.uuid4().hex}",
            email=None,
            phone=None,
            status=UserStatus.ACTIVE,
            display_name="Demo",
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=hash_password(password, settings.auth))

        service = AuthService(settings, valkey=app.state.valkey)
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
        await close_orm()
        await close_valkey(app)
