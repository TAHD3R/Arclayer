from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID


class CredentialLike(Protocol):
    # NOTE: Tortoise field descriptors are typed as `Field[T]` which doesn't line up with
    # runtime attribute values. Use `Any` here to keep the contract compatible with both
    # Tortoise models and lightweight unit-test fakes.
    password_hash: Any


class UserLike(Protocol):
    id: Any
    username: Any
    email: Any
    display_name: Any
    avatar_url: Any
    token_version: Any


class UserRepositoryLike(Protocol):
    async def get_by_identifier(self, identifier: str) -> UserLike | None: ...

    async def get_by_id(self, user_id: UUID) -> UserLike | None: ...

    async def get_by_id_with_credential(self, user_id: UUID) -> UserLike | None: ...

    async def update_last_login(self, user: UserLike) -> None: ...

    async def increment_token_version(self, user: UserLike) -> UserLike: ...

    def is_active(self, user: UserLike) -> bool: ...

    async def set_password(self, user: UserLike, password_hash: str) -> None: ...

    async def exists_username(self, username: str) -> bool: ...

    async def exists_email(self, email: str) -> bool: ...

    async def set_email(self, user: UserLike, email: str | None) -> UserLike: ...

    async def patch_profile(
        self,
        user: UserLike,
        *,
        display_name: str | None | object = ...,
    ) -> UserLike: ...

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
    ) -> UserLike: ...
