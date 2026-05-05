from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.common.constants.auth import REFRESH_STATUS_ACTIVE, REFRESH_STATUS_REVOKED, REFRESH_STATUS_ROTATED
from src.common.protocols.tortoise import UserMutableFields
from src.common.utils.ids import uuid7
from src.config import AuthSettings
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.user import User, UserCredential, UserStatus
from src.modules.auth.contracts.schema import UserLike
from src.platform.cache.valkey import ValkeyClientLike

EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 60


def _coerce_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


class UserRepository(TortoiseORMRepository):
    _UNSET = object()

    async def get_by_identifier(self, identifier: str) -> User | None:
        identifier = identifier.strip()
        filters = Q()
        if identifier and len(identifier) <= 64:
            filters |= Q(username=identifier)
        if "@" in identifier and len(identifier) <= 255:
            filters |= Q(email=identifier)
        if not filters:
            return None
        return await User.get_or_none(filters).prefetch_related("credential")

    async def get_by_email(self, email: str) -> User | None:
        normalized = email.strip().lower()
        if not normalized or len(normalized) > 255:
            return None
        return await User.get_or_none(email=normalized).prefetch_related("credential")

    async def get_by_id(self, user_id: UUID) -> User | None:
        return await User.get_or_none(id=user_id)

    async def get_by_id_in_connection(self, user_id: UUID, *, conn: BaseDBAsyncClient) -> User | None:
        return await User.get_or_none(id=user_id, using_db=conn)

    async def exists_username_in_connection(self, username: str, *, conn: BaseDBAsyncClient) -> bool:
        return await User.filter(username=username).using_db(conn).exists()

    async def exists_email_in_connection(self, email: str, *, conn: BaseDBAsyncClient) -> bool:
        return await User.filter(email=email).using_db(conn).exists()

    async def list_by_ids(self, user_ids: list[UUID]) -> list[User]:
        if not user_ids:
            return []
        return await User.filter(id__in=list(user_ids)).all()

    async def count_super_admins(self) -> int:
        return int(await User.filter(is_super_admin=True).count())

    async def exists_by_username(self, username: str) -> bool:
        return await User.filter(username=username).exists()

    async def exists_by_email(self, email: str) -> bool:
        return await User.filter(email=email).exists()

    async def list_matching(self, needle: str) -> list[User]:
        normalized = needle.strip()
        if not normalized:
            return []
        return await User.filter(
            Q(username__icontains=normalized) | Q(email__icontains=normalized) | Q(display_name__icontains=normalized)
        ).all()

    async def get_by_id_with_credential(self, user_id: UUID) -> User | None:
        return await User.get_or_none(id=user_id).prefetch_related("credential")

    async def get_by_id_with_credential_in_connection(self, user_id: UUID, *, conn: BaseDBAsyncClient) -> User | None:
        return await User.filter(id=user_id).using_db(conn).prefetch_related("credential").first()

    async def update_last_login(self, user: UserLike) -> None:
        record = cast(User, user)
        record.last_login_at = datetime.now(UTC)
        await record.save(update_fields=["last_login_at"])

    async def update_last_login_in_connection(self, user: UserLike, *, conn: BaseDBAsyncClient) -> None:
        record = cast(User, user)
        record.last_login_at = datetime.now(UTC)
        await record.save(update_fields=["last_login_at"], using_db=conn)

    async def increment_token_version(self, user: UserLike) -> User:
        record = cast(User, user)
        record.token_version = (record.token_version or 0) + 1
        await record.save(update_fields=["token_version"])
        return record

    async def increment_token_version_in_connection(self, user: UserLike, *, conn: BaseDBAsyncClient) -> User:
        record = cast(User, user)
        record.token_version = (record.token_version or 0) + 1
        await record.save(update_fields=["token_version"], using_db=conn)
        return record

    def is_active(self, user: UserLike) -> bool:
        record = cast(User, user)
        return record.status == UserStatus.ACTIVE

    async def exists_username(self, username: str) -> bool:
        return await User.filter(username=username).exists()

    async def exists_email(self, email: str) -> bool:
        return await User.filter(email=email).exists()

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
        is_super_admin: bool = False,
    ) -> User:
        user = await User.create(
            username=username,
            email=email,
            status=UserStatus.ACTIVE,
            is_super_admin=is_super_admin,
            display_name=display_name,
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=password_hash)
        return user

    async def create_user_in_connection(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
        conn: BaseDBAsyncClient,
        is_super_admin: bool = False,
    ) -> User:
        user = await User.create(
            using_db=conn,
            username=username,
            email=email,
            status=UserStatus.ACTIVE,
            is_super_admin=is_super_admin,
            display_name=display_name,
            avatar_url=None,
        )
        await UserCredential.create(using_db=conn, user_id=user.id, password_hash=password_hash)
        return user

    async def set_password(self, user: UserLike, password_hash: str) -> None:
        record = cast(User, user)
        credential = await UserCredential.get_or_none(user_id=record.id)
        if credential is None:
            await UserCredential.create(user=record, password_hash=password_hash)
            return
        credential.password_hash = password_hash
        credential.password_updated_at = datetime.now(UTC)
        await credential.save(update_fields=["password_hash", "password_updated_at"])

    async def set_password_in_connection(
        self,
        user: UserLike,
        *,
        password_hash: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        record = cast(User, user)
        credential = await UserCredential.get_or_none(user_id=record.id, using_db=conn)
        if credential is None:
            await UserCredential.create(user_id=record.id, password_hash=password_hash, using_db=conn)
            return
        credential.password_hash = password_hash
        credential.password_updated_at = datetime.now(UTC)
        await credential.save(update_fields=["password_hash", "password_updated_at"], using_db=conn)

    async def remove_password(self, user: UserLike) -> None:
        record = cast(User, user)
        await UserCredential.filter(user_id=record.id).delete()

    async def remove_password_in_connection(self, user: UserLike, *, conn: BaseDBAsyncClient) -> None:
        record = cast(User, user)
        await UserCredential.filter(user_id=record.id).using_db(conn).delete()

    async def patch_profile(
        self,
        user: UserLike,
        *,
        display_name: str | None | object = _UNSET,
        avatar_url: str | None | object = _UNSET,
        avatar_asset_id: UUID | None | object = _UNSET,
    ) -> User:
        record = cast(User, user)
        update_fields: list[str] = []

        if display_name is not self._UNSET:
            mutable = cast(UserMutableFields, record)
            mutable.display_name = cast(str | None, display_name)
            update_fields.append("display_name")

        if avatar_url is not self._UNSET:
            mutable = cast(UserMutableFields, record)
            mutable.avatar_url = cast(str | None, avatar_url)
            update_fields.append("avatar_url")

        if avatar_asset_id is not self._UNSET:
            mutable = cast(UserMutableFields, record)
            mutable.avatar_asset_id = cast(UUID | None, avatar_asset_id)
            update_fields.append("avatar_asset_id")

        if not update_fields:
            return record

        await record.save(update_fields=update_fields)
        return record

    async def set_email(self, user: UserLike, email: str | None) -> User:
        record = cast(User, user)
        mutable = cast(UserMutableFields, record)
        mutable.email = email
        await record.save(update_fields=["email"])
        return record

    async def set_status(self, user: UserLike, status: UserStatus) -> User:
        record = cast(User, user)
        record.status = status
        await record.save(update_fields=["status"])
        return record

    async def anonymize_user(self, user: UserLike) -> User:
        record = cast(User, user)
        mutable = cast(UserMutableFields, record)
        # Keep username unique and within the allowed charset.
        suffix = secrets.token_hex(6)
        mutable.username = f"deleted_{suffix}"
        mutable.email = None
        mutable.display_name = None
        mutable.avatar_url = None
        mutable.avatar_asset_id = None
        record.status = UserStatus.DISABLED
        await record.save(
            update_fields=[
                "username",
                "email",
                "display_name",
                "avatar_url",
                "avatar_asset_id",
                "status",
            ]
        )
        return record

    async def anonymize_user_in_connection(self, user: UserLike, *, conn: BaseDBAsyncClient) -> User:
        record = cast(User, user)
        mutable = cast(UserMutableFields, record)
        # Keep username unique and within the allowed charset.
        suffix = secrets.token_hex(6)
        mutable.username = f"deleted_{suffix}"
        mutable.email = None
        mutable.display_name = None
        mutable.avatar_url = None
        mutable.avatar_asset_id = None
        record.status = UserStatus.DISABLED
        await record.save(
            update_fields=[
                "username",
                "email",
                "display_name",
                "avatar_url",
                "avatar_asset_id",
                "status",
            ],
            using_db=conn,
        )
        return record


class EmailChangeStore:
    """
    Store email change verification codes (per-user).

    Notes:
    - We only allow one active code per user.
    - We store the code in plain text because Valkey is already a trusted server-side store,
      and the code has short TTL + limited attempts.
    """

    def __init__(
        self,
        client: ValkeyClientLike,
        *,
        ttl_seconds: int = 10 * 60,
        resend_cooldown_seconds: int = EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
    ) -> None:
        self._client = client
        self._ttl_seconds = max(int(ttl_seconds), 60)
        self._resend_cooldown_seconds = max(int(resend_cooldown_seconds), 1)

    def _user_key(self, user_id: UUID) -> str:
        return f"auth:email_change:user:{user_id}"

    async def issue(self, *, user_id: UUID, new_email: str) -> tuple[str, int, int]:
        code = f"{secrets.randbelow(1_000_000):06d}"
        ttl = self._ttl_seconds
        retry_after = self._resend_cooldown_seconds
        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "user_id": str(user_id),
            "new_email": new_email,
            "code": code,
            "issued_at": now_ts,
            "expires_at": now_ts + ttl,
            "resend_available_at": now_ts + retry_after,
            "attempts": 0,
        }
        await self._client.set_json(self._user_key(user_id), record, ex=ttl)
        return code, ttl, retry_after

    async def get(self, *, user_id: UUID) -> dict[str, Any] | None:
        record = await self._client.get_json(self._user_key(user_id))
        return record if isinstance(record, dict) else None

    async def delete(self, *, user_id: UUID) -> None:
        await self._client.delete(self._user_key(user_id))

    async def bump_attempts(self, *, user_id: UUID) -> int:
        record = await self.get(user_id=user_id)
        if not record:
            return 0
        tries = int(record.get("attempts") or 0) + 1
        record["attempts"] = tries
        # Preserve remaining TTL when updating.
        ttl = self.remaining_expires_in(record)
        ex = ttl if ttl > 0 else None
        await self._client.set_json(self._user_key(user_id), record, ex=ex)
        return tries

    def remaining_expires_in(self, record: dict[str, Any]) -> int:
        return self._remaining_ttl(record)

    def remaining_retry_after(self, record: dict[str, Any]) -> int:
        now_ts = int(datetime.now(UTC).timestamp())
        resend_available_at = _coerce_int(record.get("resend_available_at"))
        if resend_available_at is None:
            return 0
        return max(resend_available_at - now_ts, 0)

    def _remaining_ttl(self, record: dict[str, Any]) -> int:
        now_ts = int(datetime.now(UTC).timestamp())
        expires_at = _coerce_int(record.get("expires_at"))
        if expires_at is None:
            return 0
        return max(expires_at - now_ts, 0)


class EmailLoginCodeStore:
    """
    Store short-lived login verification codes keyed by normalized email.

    Notes:
    - One active code per email.
    - Codes are stored in plaintext in Valkey with short TTL and bounded attempts.
    - Resend cooldown is tracked inside the record so the caller can render countdown UI.
    """

    def __init__(
        self,
        client: ValkeyClientLike,
        *,
        ttl_seconds: int = 10 * 60,
        resend_cooldown_seconds: int = EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
        max_attempts: int = 5,
    ) -> None:
        self._client = client
        self._ttl_seconds = max(int(ttl_seconds), 60)
        self._resend_cooldown_seconds = max(int(resend_cooldown_seconds), 1)
        self.max_attempts = max(int(max_attempts), 3)

    def _email_key(self, email: str) -> str:
        return f"auth:login_code:email:{email.strip().lower()}"

    async def issue(self, *, email: str, user_id: UUID) -> tuple[str, int, int]:
        normalized_email = email.strip().lower()
        code = f"{secrets.randbelow(1_000_000):06d}"
        ttl = self._ttl_seconds
        retry_after = self._resend_cooldown_seconds
        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "user_id": str(user_id),
            "email": normalized_email,
            "code": code,
            "issued_at": now_ts,
            "expires_at": now_ts + ttl,
            "resend_available_at": now_ts + retry_after,
            "attempts": 0,
        }
        await self._client.set_json(self._email_key(normalized_email), record, ex=ttl)
        return code, ttl, retry_after

    async def get(self, *, email: str) -> dict[str, Any] | None:
        record = await self._client.get_json(self._email_key(email))
        return record if isinstance(record, dict) else None

    async def delete(self, *, email: str) -> None:
        await self._client.delete(self._email_key(email))

    async def bump_attempts(self, *, email: str) -> int:
        record = await self.get(email=email)
        if not record:
            return 0
        tries = int(record.get("attempts") or 0) + 1
        record["attempts"] = tries
        ttl = self._remaining_ttl(record)
        ex = ttl if ttl > 0 else None
        await self._client.set_json(self._email_key(email), record, ex=ex)
        return tries

    def remaining_expires_in(self, record: dict[str, Any]) -> int:
        return self._remaining_ttl(record)

    def remaining_retry_after(self, record: dict[str, Any]) -> int:
        now_ts = int(datetime.now(UTC).timestamp())
        resend_available_at = _coerce_int(record.get("resend_available_at"))
        if resend_available_at is None:
            return 0
        return max(resend_available_at - now_ts, 0)

    def _remaining_ttl(self, record: dict[str, Any]) -> int:
        now_ts = int(datetime.now(UTC).timestamp())
        expires_at = _coerce_int(record.get("expires_at"))
        if expires_at is None:
            return 0
        return max(expires_at - now_ts, 0)


class PasswordRemovalCodeStore:
    """
    Store short-lived password-removal verification codes keyed by user id.

    Notes:
    - One active code per user.
    - Codes are stored in plaintext in Valkey with short TTL and bounded attempts.
    - Resend cooldown is tracked inside the record so the caller can render countdown UI.
    """

    def __init__(
        self,
        client: ValkeyClientLike,
        *,
        ttl_seconds: int = 10 * 60,
        resend_cooldown_seconds: int = EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
        max_attempts: int = 5,
    ) -> None:
        self._client = client
        self._ttl_seconds = max(int(ttl_seconds), 60)
        self._resend_cooldown_seconds = max(int(resend_cooldown_seconds), 1)
        self.max_attempts = max(int(max_attempts), 3)

    def _user_key(self, user_id: UUID) -> str:
        return f"auth:remove_password:user:{user_id}"

    async def issue(self, *, user_id: UUID, email: str) -> tuple[str, int, int]:
        normalized_email = email.strip().lower()
        code = f"{secrets.randbelow(1_000_000):06d}"
        ttl = self._ttl_seconds
        retry_after = self._resend_cooldown_seconds
        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "user_id": str(user_id),
            "email": normalized_email,
            "code": code,
            "issued_at": now_ts,
            "expires_at": now_ts + ttl,
            "resend_available_at": now_ts + retry_after,
            "attempts": 0,
        }
        await self._client.set_json(self._user_key(user_id), record, ex=ttl)
        return code, ttl, retry_after

    async def get(self, *, user_id: UUID) -> dict[str, Any] | None:
        record = await self._client.get_json(self._user_key(user_id))
        return record if isinstance(record, dict) else None

    async def delete(self, *, user_id: UUID) -> None:
        await self._client.delete(self._user_key(user_id))

    async def bump_attempts(self, *, user_id: UUID) -> int:
        record = await self.get(user_id=user_id)
        if not record:
            return 0
        tries = int(record.get("attempts") or 0) + 1
        record["attempts"] = tries
        ttl = self._remaining_ttl(record)
        ex = ttl if ttl > 0 else None
        await self._client.set_json(self._user_key(user_id), record, ex=ex)
        return tries

    def remaining_expires_in(self, record: dict[str, Any]) -> int:
        return self._remaining_ttl(record)

    def remaining_retry_after(self, record: dict[str, Any]) -> int:
        now_ts = int(datetime.now(UTC).timestamp())
        resend_available_at = _coerce_int(record.get("resend_available_at"))
        if resend_available_at is None:
            return 0
        return max(resend_available_at - now_ts, 0)

    def _remaining_ttl(self, record: dict[str, Any]) -> int:
        now_ts = int(datetime.now(UTC).timestamp())
        expires_at = _coerce_int(record.get("expires_at"))
        if expires_at is None:
            return 0
        return max(expires_at - now_ts, 0)


class RefreshTokenStore:
    def __init__(self, client: ValkeyClientLike, settings: AuthSettings) -> None:
        self._client = client
        self._settings = settings

    def _refresh_key(self, jti: str) -> str:
        return f"auth:refresh:{jti}"

    def _user_set_key(self, user_id: UUID) -> str:
        return f"auth:user:{user_id}:refresh"

    async def store(self, record: dict[str, Any], *, ttl: int) -> None:
        key = self._refresh_key(record["jti"])
        await self._client.set_json(key, record, ex=ttl)
        user_uuid = UUID(str(record["user_id"]))
        set_key = self._user_set_key(user_uuid)
        await self._client.sadd(set_key, str(record["jti"]))
        if ttl > 0:
            await self._client.expire(set_key, ttl)

    async def forget(self, jti: str) -> None:
        record = await self.get(jti)
        if record is None:
            return
        await self._client.delete(self._refresh_key(jti))
        await self._client.srem(self._user_set_key(UUID(str(record["user_id"]))), jti)

    async def get(self, jti: str) -> dict[str, Any] | None:
        data = await self._client.get_json(self._refresh_key(jti))
        return data if isinstance(data, dict) else None

    async def update(self, jti: str, record: dict[str, Any]) -> None:
        ttl = await self._client.ttl(self._refresh_key(jti))
        ex = ttl if ttl and ttl > 0 else None
        await self._client.set_json(self._refresh_key(jti), record, ex=ex)

    async def mark_rotated(self, jti: str, *, replaced_by: str) -> None:
        record = await self.get(jti)
        if not record:
            return
        record["status"] = REFRESH_STATUS_ROTATED
        record["replaced_by"] = replaced_by
        record["rotated_at"] = int(datetime.now(UTC).timestamp())
        await self.update(jti, record)
        await self._client.srem(self._user_set_key(UUID(str(record["user_id"]))), jti)

    async def revoke(self, jti: str) -> None:
        record = await self.get(jti)
        if not record:
            return
        record["status"] = REFRESH_STATUS_REVOKED
        record["revoked_at"] = int(datetime.now(UTC).timestamp())
        await self.update(jti, record)
        await self._client.srem(self._user_set_key(UUID(str(record["user_id"]))), jti)

    async def restore_active(self, jti: str, *, previous_record: dict[str, Any]) -> None:
        record = dict(previous_record)
        user_id = UUID(str(record["user_id"]))
        record["status"] = REFRESH_STATUS_ACTIVE
        record.pop("revoked_at", None)
        expires_at = _coerce_int(record.get("expires_at"))
        ttl = None
        if expires_at is not None:
            ttl = max(expires_at - int(datetime.now(UTC).timestamp()), 0)
        await self._client.set_json(self._refresh_key(jti), record, ex=ttl if ttl and ttl > 0 else None)
        await self._client.sadd(self._user_set_key(user_id), jti)
        if ttl is not None and ttl > 0:
            await self._client.expire(self._user_set_key(user_id), ttl)

    async def list_active(self, user_id: UUID) -> list[str]:
        return sorted(await self._client.smembers(self._user_set_key(user_id)))

    async def revoke_all(self, user_id: UUID) -> None:
        jtis = await self.list_active(user_id)
        for jti in jtis:
            await self._client.delete(self._refresh_key(jti))
        await self._client.delete(self._user_set_key(user_id))


class PasswordResetStore:
    def __init__(self, client: ValkeyClientLike, settings: AuthSettings) -> None:
        self._client = client
        self._settings = settings

    def _token_key(self, token: str) -> str:
        return f"auth:reset:{token}"

    def _user_key(self, user_id: UUID) -> str:
        return f"auth:reset:user:{user_id}"

    async def issue(self, user_id: UUID) -> tuple[str, int]:
        ttl = max(self._settings.reset_token_ttl_seconds, 1)
        existing = await self._client.get(self._user_key(user_id))
        if existing:
            await self._client.delete(self._token_key(existing))

        token = uuid7().hex
        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "user_id": str(user_id),
            "issued_at": now_ts,
            "expires_at": now_ts + ttl,
        }
        await self._client.set_json(self._token_key(token), record, ex=ttl)
        await self._client.set(self._user_key(user_id), token, ex=ttl)
        return token, ttl

    async def consume(self, token: str) -> dict[str, Any] | None:
        record = await self._client.get_json(self._token_key(token))
        if not isinstance(record, dict):
            return None
        await self._client.delete(self._token_key(token))
        user_id = record.get("user_id")
        if user_id:
            user_uuid = UUID(str(user_id))
            current = await self._client.get(self._user_key(user_uuid))
            if current == token:
                await self._client.delete(self._user_key(user_uuid))
        return record

    async def restore(self, token: str, *, previous_record: dict[str, Any]) -> None:
        record = dict(previous_record)
        user_id = record.get("user_id")
        if not user_id:
            return
        user_uuid = UUID(str(user_id))
        expires_at = _coerce_int(record.get("expires_at"))
        ttl = None
        if expires_at is not None:
            ttl = max(expires_at - int(datetime.now(UTC).timestamp()), 0)
        await self._client.set_json(self._token_key(token), record, ex=ttl if ttl and ttl > 0 else None)
        await self._client.set(self._user_key(user_uuid), token, ex=ttl if ttl and ttl > 0 else None)
