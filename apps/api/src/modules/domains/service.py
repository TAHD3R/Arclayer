from __future__ import annotations

import secrets
from typing import Any, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.protocols.tortoise import DomainBindingRecordView
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.i18n import t
from src.core.services import BaseService
from src.models.domains.domain_binding import DomainBindingRecord, DomainBindingSource
from src.modules.domains.hostname import HostnameValidationError, validate_custom_hostname
from src.modules.domains.platform import build_platform_hostname
from src.modules.domains.repository import DomainBindingRepository
from src.modules.domains.schema import DomainBindingDnsInstructionOut, domain_datetime_to_ms
from src.platform.cache.valkey import ValkeyClientLike

_CACHE_KEY_PREFIX = "site:resolve:host"
_TXT_PREFIX = "arclayer-site-verification="
_TXT_LABEL = "_arclayer-site-verification"


def _te(key: str) -> str:
    return t("errors", key)


class _DnsTxtLookupResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    ok: bool
    observed: list[str]


class DomainBindingService(BaseService):
    def __init__(self, settings, *, valkey: ValkeyClientLike | None = None) -> None:
        super().__init__(settings)
        self._repo = DomainBindingRepository()
        self._valkey = valkey

    def _cache_key_for_host(self, host: str) -> str:
        return f"{_CACHE_KEY_PREFIX}:{host}"

    async def _invalidate_resolve_cache_best_effort(self, *, hostname: str) -> None:
        if self._valkey is None:
            return
        try:
            await self._valkey.delete(self._cache_key_for_host(hostname))
        except Exception:
            return

    @staticmethod
    def build_dns_instruction(*, hostname: str, token: str) -> DomainBindingDnsInstructionOut:
        return DomainBindingDnsInstructionOut(
            txtRecordName=f"{_TXT_LABEL}.{hostname}".rstrip("."),
            txtRecordValue=f"{_TXT_PREFIX}{token}",
        )

    @staticmethod
    def _raise_hostname_conflict(exc: HostnameValidationError) -> None:
        raise Conflict(str(exc), error=exc.error) from exc

    async def list_bindings_for_project(self, *, project_id: UUID) -> list[DomainBindingRecord]:
        return await self._repo.list_for_project(project_id=project_id)

    async def ensure_platform_binding(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        project_slug: str,
        actor_user_id: UUID | None,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> DomainBindingRecord:
        existing = await self._repo.get_platform_binding_for_runtime(runtime_id=runtime_id, conn=conn)
        if existing is not None:
            return existing

        hostname = build_platform_hostname(project_slug, project_id, self.settings.saas.base_domain)
        is_primary = not await self._repo.has_primary_binding(project_id=project_id, conn=conn)
        binding = await self._repo.create_platform_binding(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            hostname=hostname,
            is_primary=is_primary,
            created_by_user_id=actor_user_id,
            environment_id=environment_id,
            conn=conn,
        )
        await self._invalidate_resolve_cache_best_effort(hostname=hostname)
        return binding

    async def create_custom_binding(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        hostname: str,
        actor_user_id: UUID | None,
        environment_id: UUID | None = None,
    ) -> DomainBindingRecord:
        try:
            normalized = validate_custom_hostname(hostname, self.settings.saas.base_domain)
        except HostnameValidationError as exc:
            self._raise_hostname_conflict(exc)

        token = secrets.token_urlsafe(24)
        is_primary = not await self._repo.has_primary_binding(project_id=project_id)
        binding = await self._repo.create_custom_binding(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            hostname=normalized,
            verification_token=token,
            is_primary=is_primary,
            created_by_user_id=actor_user_id,
            environment_id=environment_id,
        )
        await self._invalidate_resolve_cache_best_effort(hostname=normalized)
        return binding

    async def _lookup_dns_txt_async(self, *, txt_name: str) -> _DnsTxtLookupResult:
        try:
            import dns.asyncresolver  # type: ignore[import-not-found]
            import dns.exception  # type: ignore[import-not-found]
            import dns.resolver  # type: ignore[import-not-found]
        except ImportError as exc:  # pragma: no cover
            raise ServiceUnavailable(
                _te("DNS_RESOLVER_DEPENDENCY_MISSING"),
                error="DNS_RESOLVER_DEPENDENCY_MISSING",
            ) from exc

        resolver = dns.asyncresolver.Resolver()  # type: ignore[attr-defined]
        resolver.timeout = 2.0
        resolver.lifetime = 5.0

        observed: list[str] = []
        try:
            answers = await resolver.resolve(txt_name, "TXT")  # type: ignore[no-any-return]
            for rdata in answers:
                strings = getattr(rdata, "strings", None)
                if strings:
                    parts: list[str] = []
                    for item in strings:
                        try:
                            parts.append(item.decode("utf-8", errors="ignore"))
                        except AttributeError:
                            parts.append(str(item))
                    value = "".join(parts)
                else:
                    to_text = getattr(rdata, "to_text", None)
                    value = str(to_text() if callable(to_text) else rdata)
                value = value.strip().strip('"')
                if value:
                    observed.append(value)
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):  # type: ignore[attr-defined]
            return _DnsTxtLookupResult(ok=False, observed=[])
        except (dns.exception.Timeout, dns.resolver.LifetimeTimeout):  # type: ignore[attr-defined]
            raise ServiceUnavailable(_te("DNS_LOOKUP_TIMEOUT"), error="DNS_LOOKUP_TIMEOUT") from None
        except Exception as exc:
            raise ServiceUnavailable(_te("DNS_LOOKUP_FAILED"), error="DNS_LOOKUP_FAILED") from exc

        return _DnsTxtLookupResult(ok=True, observed=observed[:20])

    async def verify_custom_binding(
        self,
        *,
        project_id: UUID,
        binding_id: UUID,
    ) -> tuple[DomainBindingRecord, list[str]]:
        binding = await self._repo.get_by_id_for_project(project_id=project_id, binding_id=binding_id)
        binding_view = cast(DomainBindingRecordView, binding)
        if binding_view.source != DomainBindingSource.CUSTOM:
            raise Conflict(_te("DOMAIN_BINDING_VERIFY_NOT_ALLOWED"), error="DOMAIN_BINDING_VERIFY_NOT_ALLOWED")
        if not binding_view.verification_token:
            raise Conflict(
                _te("DOMAIN_BINDING_VERIFICATION_TOKEN_MISSING"),
                error="DOMAIN_BINDING_VERIFICATION_TOKEN_MISSING",
            )

        dns = self.build_dns_instruction(
            hostname=str(binding_view.hostname),
            token=str(binding_view.verification_token),
        )
        lookup = await self._lookup_dns_txt_async(txt_name=dns.txt_record_name)
        if dns.txt_record_value in lookup.observed:
            binding = await self._repo.mark_verified(binding_id=binding_id)
            await self._invalidate_resolve_cache_best_effort(hostname=str(binding.hostname))
        return binding, lookup.observed

    async def set_binding_active(
        self,
        *,
        project_id: UUID,
        binding_id: UUID,
        is_active: bool,
    ) -> DomainBindingRecord:
        binding = await self._repo.get_by_id_for_project(project_id=project_id, binding_id=binding_id)
        binding_view = cast(DomainBindingRecordView, binding)
        next_active = bool(is_active)
        if next_active and not binding_view.is_verified:
            raise Conflict(_te("DOMAIN_BINDING_NOT_VERIFIED"), error="DOMAIN_BINDING_NOT_VERIFIED")
        if (
            not next_active
            and binding_view.source == DomainBindingSource.PLATFORM
            and not await self._repo.has_other_active_platform_binding(
                project_id=project_id,
                exclude_binding_id=binding_id,
            )
        ):
            raise Conflict(
                _te("DOMAIN_BINDING_LAST_PLATFORM_ACTIVE_REQUIRED"),
                error="DOMAIN_BINDING_LAST_PLATFORM_ACTIVE_REQUIRED",
            )

        updated = await self._repo.set_active(binding_id=binding_id, is_active=next_active)
        await self._invalidate_resolve_cache_best_effort(hostname=str(updated.hostname))
        return updated

    async def delete_custom_binding(self, *, project_id: UUID, binding_id: UUID) -> None:
        binding = await self._repo.get_by_id_for_project(project_id=project_id, binding_id=binding_id)
        binding_view = cast(DomainBindingRecordView, binding)
        if binding_view.source != DomainBindingSource.CUSTOM:
            raise Conflict(_te("DOMAIN_BINDING_DELETE_NOT_ALLOWED"), error="DOMAIN_BINDING_DELETE_NOT_ALLOWED")
        await self._repo.delete_custom_binding(binding_id=binding_id)
        await self._invalidate_resolve_cache_best_effort(hostname=str(binding_view.hostname))

    def to_out(self, binding: DomainBindingRecord) -> dict[str, Any]:
        binding_view = cast(DomainBindingRecordView, binding)
        verification_token = (
            str(binding_view.verification_token)
            if binding_view.source == DomainBindingSource.CUSTOM and binding_view.verification_token
            else None
        )
        dns = None
        if binding_view.source == DomainBindingSource.CUSTOM and not binding_view.is_verified and verification_token:
            dns = self.build_dns_instruction(hostname=str(binding_view.hostname), token=verification_token)

        runtime_name = None
        runtime = getattr(binding, "runtime", None)
        if runtime is not None:
            runtime_name = str(getattr(runtime, "name", "") or "")

        return {
            "bindingId": binding_view.id,
            "hostname": str(binding_view.hostname),
            "source": str(binding_view.source),
            "targetType": str(binding_view.target_type),
            "workspaceId": binding_view.workspace_id,
            "projectId": binding_view.project_id,
            "runtimeId": binding_view.runtime_id,
            "runtimeName": runtime_name or None,
            "siteId": binding_view.site_id,
            "environmentId": binding_view.environment_id,
            "isPrimary": bool(binding_view.is_primary),
            "isVerified": bool(binding_view.is_verified),
            "isActive": bool(binding_view.is_active),
            "verificationToken": verification_token,
            "verifiedAtMs": domain_datetime_to_ms(binding_view.verified_at),
            "certificateStatus": str(binding_view.certificate_status),
            "createdByUserId": binding_view.created_by_user_id,
            "dns": dns,
        }
