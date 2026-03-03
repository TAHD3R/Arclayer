from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from tortoise.exceptions import IntegrityError

from apps.api.src.common.protocols.tortoise import SysConfigActiveMutableFields
from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.models.sys.sys_config_active import SysConfigActive
from apps.api.src.models.sys.sys_config_revision import SysConfigRevision


class SysConfigRepository(BaseRepository):
    async def get_revision(self, *, namespace: str, revision_id: UUID) -> SysConfigRevision | None:
        return await SysConfigRevision.get_or_none(id=revision_id, namespace=namespace)

    async def get_active(self, *, namespace: str) -> tuple[SysConfigActive | None, SysConfigRevision | None]:
        active = await SysConfigActive.get_or_none(namespace=namespace).prefetch_related("active_revision")
        if active is None:
            return None, None
        rev = getattr(active, "active_revision", None)
        return active, rev

    async def list_revisions(
        self,
        *,
        namespace: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SysConfigRevision]:
        limit = max(1, min(int(limit or 50), 200))
        offset = max(0, int(offset or 0))
        return await SysConfigRevision.filter(namespace=namespace).order_by("-created_at").offset(offset).limit(limit)

    async def create_revision(
        self,
        *,
        namespace: str,
        value: dict[str, Any],
        base_revision_id: UUID | None,
        created_by: UUID | None,
        signature: str | None,
        signing_key_fingerprint: str | None,
    ) -> SysConfigRevision:
        return await SysConfigRevision.create(
            namespace=namespace,
            value=value,
            base_revision_id=base_revision_id,
            created_by=created_by,
            signature=signature,
            signing_key_fingerprint=signing_key_fingerprint,
        )

    async def activate(
        self,
        *,
        namespace: str,
        revision: SysConfigRevision,
        activated_by: UUID | None,
    ) -> SysConfigActive:
        active = await SysConfigActive.get_or_none(namespace=namespace)
        if active is None:
            try:
                return await SysConfigActive.create(
                    namespace=namespace,
                    active_revision=revision,
                    activated_by=activated_by,
                )
            except IntegrityError:
                # Race: another request created the unique active pointer concurrently.
                active = await SysConfigActive.get_or_none(namespace=namespace)
                if active is None:
                    raise
        active.active_revision = revision
        cast(SysConfigActiveMutableFields, active).activated_by = activated_by
        await active.save()
        return active
