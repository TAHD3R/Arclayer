from __future__ import annotations

from typing import Protocol
from uuid import UUID


class CredentialLike(Protocol):
    @property
    def password_hash(self) -> object: ...


class UserLike(Protocol):
    @property
    def id(self) -> object: ...

    @property
    def username(self) -> object: ...

    @property
    def email(self) -> object: ...

    @property
    def display_name(self) -> object: ...

    @property
    def avatar_url(self) -> object: ...

    @property
    def token_version(self) -> object: ...


class UserRepositoryLike(Protocol):
    async def get_by_identifier(self, identifier: str) -> UserLike | None: ...

    async def get_by_email(self, email: str) -> UserLike | None: ...

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
        is_super_admin: bool = False,
    ) -> UserLike: ...
