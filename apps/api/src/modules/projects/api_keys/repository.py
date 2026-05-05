from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.projects.api_key import ApiKeyFamily, ApiKeyRecord


class ProjectApiKeysRepository(TortoiseORMRepository):
    @staticmethod
    def _using_db(qs, conn: BaseDBAsyncClient | None):
        return qs if conn is None else qs.using_db(conn)

    async def get_key_by_public_id(self, *, token_public_id: str) -> ApiKeyRecord | None:
        return await ApiKeyRecord.filter(token_public_id=token_public_id).first()

    async def list_personal_keys(self, *, owner_user_id: UUID) -> list[ApiKeyRecord]:
        return (
            await ApiKeyRecord
            .filter(
                owner_user_id=owner_user_id,
                key_family=ApiKeyFamily.PERSONAL_MANAGEMENT,
            )
            .order_by("-created_at", "-id")
            .all()
        )

    async def list_project_site_keys(self, *, workspace_id: UUID, site_id: UUID) -> list[ApiKeyRecord]:
        return (
            await ApiKeyRecord
            .filter(workspace_id=workspace_id, site_id=site_id)
            .exclude(key_family=ApiKeyFamily.PERSONAL_MANAGEMENT)
            .order_by("-created_at", "-id")
            .all()
        )

    async def get_personal_key(self, *, owner_user_id: UUID, key_id: UUID) -> ApiKeyRecord | None:
        return await ApiKeyRecord.filter(
            id=key_id,
            owner_user_id=owner_user_id,
            key_family=ApiKeyFamily.PERSONAL_MANAGEMENT,
        ).first()

    async def get_project_site_key(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        key_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ApiKeyRecord | None:
        return await self._using_db(
            ApiKeyRecord.filter(id=key_id, workspace_id=workspace_id, site_id=site_id).exclude(
                key_family=ApiKeyFamily.PERSONAL_MANAGEMENT
            ),
            conn,
        ).first()

    async def create_key(
        self,
        *,
        owner_user_id: UUID | None,
        workspace_id: UUID | None,
        site_id: UUID | None,
        key_family: ApiKeyFamily,
        delivery_perspective: str | None,
        name: str,
        description: str | None,
        token_public_id: str,
        token_hash: str,
        token_mask: str,
        scopes: list[str],
        created_by_user_id: UUID | None,
        expires_at: datetime | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> ApiKeyRecord:
        row: dict[str, Any] = {
            "owner_user_id": owner_user_id,
            "workspace_id": workspace_id,
            "site_id": site_id,
            "key_family": key_family,
            "delivery_perspective": delivery_perspective,
            "name": name,
            "description": description,
            "token_public_id": token_public_id,
            "token_hash": token_hash,
            "token_mask": token_mask,
            "scopes": scopes,
            "created_by_user_id": created_by_user_id,
            "expires_at": expires_at,
        }
        if conn is None:
            return await ApiKeyRecord.create(**row)
        return await ApiKeyRecord.create(using_db=conn, **row)

    async def update_key(
        self,
        record: ApiKeyRecord,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> ApiKeyRecord:
        for key, value in fields.items():
            setattr(record, key, value)
        await record.save(update_fields=list(fields.keys()), using_db=conn)
        return record
