from __future__ import annotations

from typing import cast

from apps.api.src.common.protocols.tortoise import OrganizationLogoUrlMutableFields
from apps.api.src.models.organization.organization import Organization


class SystemSetupOrganizationBootstrapMixin:
    async def _create_default_organization(
        self,
        *,
        name: str | None,
        slug: str | None,
        logo_url: str | None,
        created_by_user_id,
    ) -> Organization:
        from apps.api.src.models.organization.organization import Organization
        from apps.api.src.modules.organization.repository import OrganizationRepository

        repo = OrganizationRepository()
        org_name = (name or "Default").strip() or "Default"
        org_slug = (slug or "default").strip() or "default"

        org = await Organization.get_or_none(slug=org_slug)
        if org is None:
            existing = await Organization.all().order_by("created_at").all()
            if len(existing) == 1 and existing[0].slug == "default":
                org = existing[0]
                org.slug = org_slug
                org.name = org_name
                cast(OrganizationLogoUrlMutableFields, org).logo_url = logo_url
                await org.save(update_fields=["slug", "name", "logo_url"])
            else:
                org = await repo.create_organization(slug=org_slug, name=org_name, logo_url=logo_url)
        else:
            changed = False
            if org.name != org_name:
                org.name = org_name
                changed = True
            if org.logo_url != logo_url:
                cast(OrganizationLogoUrlMutableFields, org).logo_url = logo_url
                changed = True
            if changed:
                await org.save(update_fields=["name", "logo_url"])

        return org
