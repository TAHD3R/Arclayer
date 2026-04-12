from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.common.repositories.base import BaseRepository
from src.core.exceptions import Conflict, NotFound
from src.models.sites.site_domain import SiteDomainRecord


class SiteDomainsRepository(BaseRepository):
    async def list_domains_for_site(self, *, site_id: UUID) -> list[SiteDomainRecord]:
        return await SiteDomainRecord.filter(site_id=site_id).order_by("created_at", "id").all()

    async def get_domain_by_id(self, *, site_id: UUID, domain_id: UUID) -> SiteDomainRecord:
        rec = await SiteDomainRecord.get_or_none(id=domain_id, site_id=site_id)
        if rec is None:
            raise NotFound("Domain not found", error="SITE_DOMAIN_NOT_FOUND")
        return rec

    async def get_domain_by_hostname(self, *, hostname: str) -> SiteDomainRecord | None:
        raw = (hostname or "").strip().lower()
        if not raw:
            return None
        return await SiteDomainRecord.get_or_none(hostname=raw)

    async def create_domain(
        self,
        *,
        site_id: UUID,
        hostname: str,
        verification_token: str,
        created_by_user_id: UUID | None,
    ) -> SiteDomainRecord:
        try:
            return await SiteDomainRecord.create(
                site_id=site_id,
                hostname=hostname,
                is_verified=False,
                is_active=True,
                verification_token=verification_token,
                verified_at=None,
                created_by_user_id=created_by_user_id,
            )
        except IntegrityError:
            raise Conflict("Hostname already bound", error="SITE_DOMAIN_HOSTNAME_CONFLICT") from None

    async def set_domain_active(
        self,
        *,
        site_id: UUID,
        domain_id: UUID,
        is_active: bool,
    ) -> SiteDomainRecord:
        async with in_transaction() as conn:
            rec = (
                await SiteDomainRecord.filter(id=domain_id, site_id=site_id).using_db(conn).select_for_update().first()
            )
            if rec is None:
                raise NotFound("Domain not found", error="SITE_DOMAIN_NOT_FOUND")

            rec.is_active = bool(is_active)
            await rec.save(update_fields=["is_active", "updated_at"], using_db=conn)
            return rec

    async def mark_domain_verified(
        self,
        *,
        site_id: UUID,
        domain_id: UUID,
    ) -> SiteDomainRecord:
        now = datetime.now(tz=UTC)
        async with in_transaction() as conn:
            rec = (
                await SiteDomainRecord.filter(id=domain_id, site_id=site_id).using_db(conn).select_for_update().first()
            )
            if rec is None:
                raise NotFound("Domain not found", error="SITE_DOMAIN_NOT_FOUND")

            if rec.is_verified:
                return rec

            rec.is_verified = True
            rec.verified_at = now
            await rec.save(update_fields=["is_verified", "verified_at", "updated_at"], using_db=conn)
            return rec

    async def delete_domain(self, *, site_id: UUID, domain_id: UUID) -> None:
        deleted = await SiteDomainRecord.filter(id=domain_id, site_id=site_id).delete()
        if not deleted:
            raise NotFound("Domain not found", error="SITE_DOMAIN_NOT_FOUND")
