from __future__ import annotations

import ipaddress
import secrets
from dataclasses import dataclass
from typing import Any, cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasOrganizationId, SiteDomainRecordView
from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict, NotFound, ServiceUnavailable
from apps.api.src.infra.cache.valkey import ValkeyClientLike
from apps.api.src.modules.organization.models.org_plan import OrgPlan
from apps.api.src.modules.sites.domains.repository import SiteDomainsRepository
from apps.api.src.modules.sites.domains.schema import (
    SiteDomainDnsInstructionOut,
    _normalize_hostname,
    domain_datetime_to_ms,
)
from apps.api.src.modules.sites.models.site_domain import SiteDomainRecord
from apps.api.src.modules.workspaces.models.workspace import Workspace
from apps.api.src.modules.workspaces.site.service import WorkspaceSiteService

_CACHE_KEY_PREFIX = "saas:site_resolve:host"
_TXT_PREFIX = "celestial-site-verification="
_TXT_LABEL = "_celestial-site-verification"


@dataclass(frozen=True)
class _DnsTxtLookupResult:
    ok: bool
    observed: list[str]


class SiteDomainsService(BaseService):
    def __init__(self, settings, *, valkey: ValkeyClientLike | None = None) -> None:
        super().__init__(settings)
        self._repo = SiteDomainsRepository()
        self._workspace_site = WorkspaceSiteService(settings)
        self._valkey = valkey

    def _assert_saas(self) -> None:
        if self.settings.application.deployment_mode != "saas":
            raise Conflict("Custom domains require SaaS mode", error="SITE_DOMAINS_SAAS_REQUIRED")

    def _cache_key_for_host(self, host: str) -> str:
        return f"{_CACHE_KEY_PREFIX}:{host}"

    async def _invalidate_resolve_cache_best_effort(self, *, hostname: str) -> None:
        if self._valkey is None:
            return
        key = self._cache_key_for_host(hostname)
        try:
            await self._valkey.delete(key)
        except Exception:
            # Best-effort: never block admin writes due to cache errors.
            return

    def build_dns_instruction(self, *, hostname: str, token: str) -> SiteDomainDnsInstructionOut:
        # Use a dedicated TXT record name so we don't pollute apex TXT entries,
        # and so verification works for any hostname (including subdomains).
        #
        # Example:
        # - hostname: "example.com"
        # - TXT name: "_celestial-site-verification.example.com"
        # - TXT value: "celestial-site-verification=<token>"
        txt_name = f"{_TXT_LABEL}.{hostname}".rstrip(".")
        return SiteDomainDnsInstructionOut(
            txtRecordName=txt_name,
            txtRecordValue=f"{_TXT_PREFIX}{token}",
        )

    def _validate_custom_hostname(self, *, hostname: str) -> str:
        raw = _normalize_hostname(hostname)
        if not raw:
            raise Conflict("Invalid hostname", error="SITE_DOMAIN_HOSTNAME_INVALID")
        if raw.startswith("*.") or "*" in raw:
            raise Conflict("Wildcard hostname not supported", error="SITE_DOMAIN_HOSTNAME_WILDCARD_NOT_SUPPORTED")
        if "/" in raw or " " in raw or "\t" in raw:
            raise Conflict("Invalid hostname", error="SITE_DOMAIN_HOSTNAME_INVALID")

        try:
            ipaddress.ip_address(raw)
        except ValueError:
            pass
        else:
            raise Conflict("IP address hostname not supported", error="SITE_DOMAIN_HOSTNAME_IP_NOT_SUPPORTED")

        if raw == "localhost":
            raise Conflict("localhost hostname not supported", error="SITE_DOMAIN_HOSTNAME_LOCALHOST_NOT_SUPPORTED")

        if len(raw) > 253:
            raise Conflict("Hostname too long", error="SITE_DOMAIN_HOSTNAME_INVALID")

        # Basic RFC-ish validation (ASCII). We intentionally keep this conservative.
        labels = raw.split(".")
        if len(labels) < 2:
            raise Conflict("Hostname must be a FQDN", error="SITE_DOMAIN_HOSTNAME_INVALID")
        for label in labels:
            if not label or len(label) > 63:
                raise Conflict("Invalid hostname", error="SITE_DOMAIN_HOSTNAME_INVALID")
            if label.startswith("-") or label.endswith("-"):
                raise Conflict("Invalid hostname", error="SITE_DOMAIN_HOSTNAME_INVALID")
            for ch in label:
                ok = ("a" <= ch <= "z") or ("0" <= ch <= "9") or ch == "-"
                if not ok:
                    raise Conflict("Invalid hostname", error="SITE_DOMAIN_HOSTNAME_INVALID")

        base_domain = (self.settings.saas.base_domain or "").strip().lower().rstrip(".")
        if base_domain:
            if raw == base_domain or raw.endswith(f".{base_domain}"):
                raise Conflict("Platform domain cannot be bound", error="SITE_DOMAIN_HOSTNAME_PLATFORM_RESERVED")

        return raw

    async def _resolve_site_id_for_workspace(self, *, workspace_id: UUID, actor_user_id: UUID | None) -> UUID:
        self._assert_saas()
        if not self.settings.database.enabled:
            raise Conflict("Custom domains require database storage", error="SITE_DOMAINS_DB_REQUIRED")

        ws = await Workspace.get_or_none(id=workspace_id)
        if ws is None or not ws.is_active:
            raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")

        ws_with_org = cast(HasOrganizationId, ws)
        plan = (
            await OrgPlan
            .filter(organization_id=ws_with_org.organization_id, is_active=True)
            .order_by("-created_at", "id")
            .first()
        )
        if plan is None or not plan.custom_domain_enabled:
            raise Conflict(
                "Custom domains are not enabled for this organization plan",
                error="SITE_DOMAIN_PLAN_CUSTOM_DOMAIN_DISABLED",
            )

        site = await self._workspace_site.get_or_create_site_for_workspace(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
        )
        return UUID(str(site.id))

    async def list_domains(self, *, workspace_id: UUID, actor_user_id: UUID | None) -> list[SiteDomainRecord]:
        site_id = await self._resolve_site_id_for_workspace(workspace_id=workspace_id, actor_user_id=actor_user_id)
        return await self._repo.list_domains_for_site(site_id=site_id)

    async def create_domain(
        self,
        *,
        workspace_id: UUID,
        hostname: str,
        actor_user_id: UUID | None,
    ) -> tuple[SiteDomainRecord, SiteDomainDnsInstructionOut]:
        site_id = await self._resolve_site_id_for_workspace(workspace_id=workspace_id, actor_user_id=actor_user_id)

        normalized = self._validate_custom_hostname(hostname=hostname)
        token = secrets.token_urlsafe(24)

        rec = await self._repo.create_domain(
            site_id=site_id,
            hostname=normalized,
            verification_token=token,
            created_by_user_id=actor_user_id,
        )
        await self._invalidate_resolve_cache_best_effort(hostname=normalized)
        return rec, self.build_dns_instruction(hostname=normalized, token=token)

    async def set_domain_active(
        self,
        *,
        workspace_id: UUID,
        domain_id: UUID,
        is_active: bool,
        actor_user_id: UUID | None,
    ) -> SiteDomainRecord:
        site_id = await self._resolve_site_id_for_workspace(workspace_id=workspace_id, actor_user_id=actor_user_id)
        rec = await self._repo.get_domain_by_id(site_id=site_id, domain_id=domain_id)
        rec_view = cast(SiteDomainRecordView, rec)
        if bool(is_active) and not rec_view.is_verified:
            raise Conflict("Domain must be verified before activation", error="SITE_DOMAIN_NOT_VERIFIED")
        updated = await self._repo.set_domain_active(site_id=site_id, domain_id=domain_id, is_active=bool(is_active))
        updated_view = cast(SiteDomainRecordView, updated)
        await self._invalidate_resolve_cache_best_effort(hostname=str(updated_view.hostname))
        return updated

    async def delete_domain(
        self,
        *,
        workspace_id: UUID,
        domain_id: UUID,
        actor_user_id: UUID | None,
    ) -> None:
        site_id = await self._resolve_site_id_for_workspace(workspace_id=workspace_id, actor_user_id=actor_user_id)
        rec = await self._repo.get_domain_by_id(site_id=site_id, domain_id=domain_id)
        await self._repo.delete_domain(site_id=site_id, domain_id=domain_id)
        rec_view = cast(SiteDomainRecordView, rec)
        await self._invalidate_resolve_cache_best_effort(hostname=str(rec_view.hostname))

    async def _lookup_dns_txt_async(self, *, txt_name: str) -> _DnsTxtLookupResult:
        """
        Resolve DNS TXT records via dnspython (async).

        Notes:
        - dnspython is treated as an optional dependency; when missing, we raise a
          clear error code so the deployment can surface an actionable message.
        """

        try:
            import dns.asyncresolver  # type: ignore[import-not-found]
            import dns.exception  # type: ignore[import-not-found]
            import dns.resolver  # type: ignore[import-not-found]
        except ImportError as exc:  # pragma: no cover
            raise ServiceUnavailable(
                "DNS resolver dependency missing (dnspython)",
                error="DNS_RESOLVER_DEPENDENCY_MISSING",
            ) from exc

        resolver = dns.asyncresolver.Resolver()  # type: ignore[attr-defined]
        # Conservative timeouts: this endpoint is user-triggered, but should not block too long.
        resolver.timeout = 2.0
        resolver.lifetime = 5.0

        observed: list[str] = []
        try:
            answers = await resolver.resolve(txt_name, "TXT")  # type: ignore[no-any-return]
            for rdata in answers:
                strings = getattr(rdata, "strings", None)
                if strings:
                    parts: list[str] = []
                    for b in strings:
                        try:
                            parts.append(b.decode("utf-8", errors="ignore"))
                        except AttributeError:
                            parts.append(str(b))
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
            raise ServiceUnavailable("DNS lookup timed out", error="DNS_LOOKUP_TIMEOUT") from None
        except Exception as exc:
            raise ServiceUnavailable("DNS lookup failed", error="DNS_LOOKUP_FAILED") from exc

        # Keep response payload small and stable.
        observed = observed[:20]
        return _DnsTxtLookupResult(ok=True, observed=observed)

    async def verify_domain(
        self,
        *,
        workspace_id: UUID,
        domain_id: UUID,
        actor_user_id: UUID | None,
    ) -> tuple[SiteDomainRecord, SiteDomainDnsInstructionOut, list[str]]:
        site_id = await self._resolve_site_id_for_workspace(workspace_id=workspace_id, actor_user_id=actor_user_id)
        rec = await self._repo.get_domain_by_id(site_id=site_id, domain_id=domain_id)
        rec_view = cast(SiteDomainRecordView, rec)

        dns = self.build_dns_instruction(hostname=str(rec_view.hostname), token=str(rec_view.verification_token))
        txt_name = dns.txt_record_name
        expected_value = dns.txt_record_value

        lookup = await self._lookup_dns_txt_async(txt_name=txt_name)
        observed = lookup.observed

        if expected_value in observed:
            updated = await self._repo.mark_domain_verified(site_id=site_id, domain_id=domain_id)
            updated_view = cast(SiteDomainRecordView, updated)
            await self._invalidate_resolve_cache_best_effort(hostname=str(updated_view.hostname))
            return updated, dns, observed

        return rec, dns, observed

    def to_out(self, rec: SiteDomainRecord) -> dict[str, Any]:
        rec_view = cast(SiteDomainRecordView, rec)
        verified_at_ms = domain_datetime_to_ms(rec_view.verified_at)
        return {
            "domainId": rec_view.id,
            "siteId": rec_view.site_id,
            "hostname": str(rec_view.hostname),
            "isVerified": bool(rec_view.is_verified),
            "isActive": bool(rec_view.is_active),
            "verificationToken": str(rec_view.verification_token),
            "verifiedAtMs": verified_at_ms,
            "createdByUserId": rec_view.created_by_user_id,
        }
