from __future__ import annotations

import json
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Unauthorized
from src.modules.auth.security_verification.service import AuthActionVerificationService
from src.modules.auth.webauthn.schema import (
    WebAuthnAuthenticationCredential,
    WebAuthnAuthenticationOptions,
)


class _Valkey:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    async def set_json(
        self,
        key: str,
        data: Any,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        _ = ex, nx, xx
        self.values[key] = json.dumps(data)
        return True

    async def getdel(self, key: str) -> str | None:
        return self.values.pop(key, None)


class _TwoFactor:
    async def is_enabled(self, *, user_id: UUID) -> bool:
        _ = user_id
        return True

    async def verify_for_login(
        self,
        *,
        user_id: UUID,
        code: str | None,
        backup_code: str | None,
    ) -> None:
        _ = user_id, backup_code
        if code != "123456":
            raise Unauthorized(error="TWO_FACTOR_CODE_INVALID")


class _WebAuthn:
    async def is_enabled(self, *, user_id: UUID) -> bool:
        _ = user_id
        return False

    async def begin_authentication(self, *, user_id: UUID, binding: str) -> WebAuthnAuthenticationOptions:
        _ = user_id, binding
        raise AssertionError("not used")

    async def complete_authentication(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential: WebAuthnAuthenticationCredential,
    ) -> UUID:
        _ = user_id, challenge_id, binding, credential
        raise AssertionError("not used")


class _RefreshStore:
    async def has_active_session(
        self,
        *,
        user_id: UUID,
        session_id: str,
        token_version: int,
    ) -> bool:
        _ = user_id
        return session_id == "active-session" and token_version == 7


def _build_service() -> AuthActionVerificationService:
    service = AuthActionVerificationService(
        get_settings(),
        valkey=cast(Any, _Valkey()),
        two_factor=_TwoFactor(),
        webauthn=cast(Any, _WebAuthn()),
    )
    service._refresh_store = cast(Any, _RefreshStore())
    return service


@pytest.mark.asyncio
async def test_action_proof_is_bound_and_single_use() -> None:
    service = _build_service()
    user_id = uuid4()
    proof, expires_in = await service.verify_totp_and_issue(
        user_id=user_id,
        session_id="active-session",
        token_version=7,
        action="change_password",
        code="123456",
        backup_code=None,
    )

    assert expires_in == 300
    await service.require(
        user_id=user_id,
        session_id="active-session",
        token_version=7,
        action="change_password",
        proof=proof,
    )

    with pytest.raises(Unauthorized) as reused:
        await service.require(
            user_id=user_id,
            session_id="active-session",
            token_version=7,
            action="change_password",
            proof=proof,
        )
    assert reused.value.error == "MFA_VERIFICATION_INVALID"


@pytest.mark.asyncio
async def test_action_proof_cannot_cross_actions() -> None:
    service = _build_service()
    user_id = uuid4()
    proof, _ = await service.verify_totp_and_issue(
        user_id=user_id,
        session_id="active-session",
        token_version=7,
        action="change_password",
        code="123456",
        backup_code=None,
    )

    with pytest.raises(Unauthorized) as mismatch:
        await service.require(
            user_id=user_id,
            session_id="active-session",
            token_version=7,
            action="delete_my_account",
            proof=proof,
        )
    assert mismatch.value.error == "MFA_VERIFICATION_BINDING_MISMATCH"
