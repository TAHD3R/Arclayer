from __future__ import annotations

from uuid import UUID

from tortoise.exceptions import ConfigurationError, OperationalError

from apps.api.modules.organization.models.organization import Organization


async def get_single_organization_id() -> UUID | None:
    """
    Resolve the current instance organization id in single-org deployments.

    Returns None when no organization record exists.
    """

    try:
        org = await Organization.all().order_by("created_at").first()
    except (ConfigurationError, OperationalError, RuntimeError, TypeError, ValueError):
        return None
    if org is None:
        return None
    return UUID(str(org.id))
