from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.domains.domain_binding import (
    DomainBindingCertificateStatus,
    DomainBindingRecord,
    DomainBindingSource,
    DomainBindingTargetType,
)


def _te(key: str) -> str:
    return t("errors", key)


class DomainBindingRepository(TortoiseORMRepository):
    async def get_by_hostname(self, *, hostname: str) -> DomainBindingRecord | None:
        raw = (hostname or "").strip().lower()
        if not raw:
            return None
        return await (
            DomainBindingRecord
            .filter(
                hostname=raw,
                workspace__is_active=True,
                project__is_active=True,
                runtime__is_active=True,
                site__is_active=True,
            )
            .prefetch_related("runtime", "site")
            .first()
        )

    async def get_by_id_for_project(self, *, project_id: UUID, binding_id: UUID) -> DomainBindingRecord:
        binding = await (
            DomainBindingRecord.filter(id=binding_id, project_id=project_id).prefetch_related("runtime", "site").first()
        )
        if binding is None:
            raise NotFound(_te("DOMAIN_BINDING_NOT_FOUND"), error="DOMAIN_BINDING_NOT_FOUND")
        return binding

    async def get_platform_binding_for_runtime(self, *, runtime_id: UUID) -> DomainBindingRecord | None:
        return await (
            DomainBindingRecord
            .filter(runtime_id=runtime_id, source=DomainBindingSource.PLATFORM)
            .prefetch_related("runtime", "site")
            .first()
        )

    async def list_for_project(self, *, project_id: UUID) -> list[DomainBindingRecord]:
        return await (
            DomainBindingRecord
            .filter(project_id=project_id)
            .prefetch_related("runtime", "site")
            .order_by("-is_primary", "source", "hostname", "created_at", "id")
            .all()
        )

    async def has_primary_binding(self, *, project_id: UUID) -> bool:
        return await DomainBindingRecord.filter(project_id=project_id, is_primary=True).exists()

    async def has_other_active_platform_binding(self, *, project_id: UUID, exclude_binding_id: UUID) -> bool:
        return (
            await DomainBindingRecord
            .filter(
                project_id=project_id,
                source=DomainBindingSource.PLATFORM,
                is_active=True,
            )
            .exclude(id=exclude_binding_id)
            .exists()
        )

    async def create_platform_binding(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        hostname: str,
        is_primary: bool,
        created_by_user_id: UUID | None,
        environment_id: UUID | None = None,
    ) -> DomainBindingRecord:
        now = datetime.now(tz=UTC)
        try:
            return await DomainBindingRecord.create(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                hostname=hostname,
                source=DomainBindingSource.PLATFORM,
                target_type=DomainBindingTargetType.PROJECT_RUNTIME,
                environment_id=environment_id,
                is_primary=is_primary,
                is_verified=True,
                is_active=True,
                verification_token=None,
                verified_at=now,
                certificate_status=DomainBindingCertificateStatus.PLATFORM_MANAGED,
                created_by_user_id=created_by_user_id,
            )
        except IntegrityError:
            raise Conflict(_te("DOMAIN_BINDING_HOSTNAME_CONFLICT"), error="DOMAIN_BINDING_HOSTNAME_CONFLICT") from None

    async def create_custom_binding(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        hostname: str,
        verification_token: str,
        is_primary: bool,
        created_by_user_id: UUID | None,
        environment_id: UUID | None = None,
    ) -> DomainBindingRecord:
        try:
            return await DomainBindingRecord.create(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                hostname=hostname,
                source=DomainBindingSource.CUSTOM,
                target_type=DomainBindingTargetType.PROJECT_RUNTIME,
                environment_id=environment_id,
                is_primary=is_primary,
                is_verified=False,
                is_active=True,
                verification_token=verification_token,
                verified_at=None,
                certificate_status=DomainBindingCertificateStatus.PENDING,
                created_by_user_id=created_by_user_id,
            )
        except IntegrityError:
            raise Conflict(_te("DOMAIN_BINDING_HOSTNAME_CONFLICT"), error="DOMAIN_BINDING_HOSTNAME_CONFLICT") from None

    async def mark_verified(self, *, binding_id: UUID) -> DomainBindingRecord:
        now = datetime.now(tz=UTC)
        async with in_transaction() as conn:
            binding = await DomainBindingRecord.filter(id=binding_id).using_db(conn).select_for_update().first()
            if binding is None:
                raise NotFound(_te("DOMAIN_BINDING_NOT_FOUND"), error="DOMAIN_BINDING_NOT_FOUND")
            if binding.is_verified:
                return binding
            binding.is_verified = True
            binding.verified_at = now
            await binding.save(update_fields=["is_verified", "verified_at", "updated_at"], using_db=conn)
            return binding

    async def set_active(self, *, binding_id: UUID, is_active: bool) -> DomainBindingRecord:
        async with in_transaction() as conn:
            binding = await DomainBindingRecord.filter(id=binding_id).using_db(conn).select_for_update().first()
            if binding is None:
                raise NotFound(_te("DOMAIN_BINDING_NOT_FOUND"), error="DOMAIN_BINDING_NOT_FOUND")
            binding.is_active = bool(is_active)
            await binding.save(update_fields=["is_active", "updated_at"], using_db=conn)
            return binding

    async def delete_custom_binding(self, *, binding_id: UUID) -> None:
        deleted = await DomainBindingRecord.filter(id=binding_id, source=DomainBindingSource.CUSTOM).delete()
        if not deleted:
            raise NotFound(_te("DOMAIN_BINDING_NOT_FOUND"), error="DOMAIN_BINDING_NOT_FOUND")
