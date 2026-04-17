from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from src.models.workspaces.api_key import ApiKeyFamily, ApiKeyRecord


class WorkspaceApiKeysRepository:
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

    async def list_workspace_keys(self, *, workspace_id: UUID) -> list[ApiKeyRecord]:
        return (
            await ApiKeyRecord
            .filter(workspace_id=workspace_id)
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

    async def get_workspace_key(self, *, workspace_id: UUID, key_id: UUID) -> ApiKeyRecord | None:
        return (
            await ApiKeyRecord
            .filter(id=key_id, workspace_id=workspace_id)
            .exclude(key_family=ApiKeyFamily.PERSONAL_MANAGEMENT)
            .first()
        )

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
    ) -> ApiKeyRecord:
        return await ApiKeyRecord.create(
            owner_user_id=owner_user_id,
            workspace_id=workspace_id,
            site_id=site_id,
            key_family=key_family,
            delivery_perspective=delivery_perspective,
            name=name,
            description=description,
            token_public_id=token_public_id,
            token_hash=token_hash,
            token_mask=token_mask,
            scopes=scopes,
            created_by_user_id=created_by_user_id,
            expires_at=expires_at,
        )

    async def update_key(self, record: ApiKeyRecord, *, fields: dict[str, Any]) -> ApiKeyRecord:
        for key, value in fields.items():
            setattr(record, key, value)
        await record.save(update_fields=list(fields.keys()))
        return record
