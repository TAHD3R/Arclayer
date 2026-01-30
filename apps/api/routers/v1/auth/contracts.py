from __future__ import annotations

from typing import Protocol
from uuid import UUID


class CredentialLike(Protocol):
    password_hash: str


class UserLike(Protocol):
    id: UUID
    username: str
    email: str | None
    display_name: str | None
    avatar_url: str | None
    token_version: int
    credential: CredentialLike | None


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

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
    ) -> UserLike: ...
