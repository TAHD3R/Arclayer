from __future__ import annotations

from apps.api.core.logging import get_logger
from apps.api.modules.organization.models.organization import Organization
from apps.api.modules.organization.models.user import UserStatus

logger = get_logger(__name__)


async def ensure_organization_ready() -> None:
    """
    Ensure organization/membership tables are usable after introducing tenant-scoped RBAC.

    Behavior:
    - If there is no organization, create a default one.
    - Ensure every active user has an org_membership record in the default org (v2).

    Notes:
    - The migration is idempotent (`get_or_create` based).
    """

    # If ORM is not initialized (e.g. in unit tests with DB disabled), do nothing.
    from tortoise import Tortoise

    if not Tortoise._inited:  # pragma: no cover
        return

    org_count = await Organization.all().count()
    if org_count == 0:
        org = await Organization.create(slug="default", name="Default", logo_url=None, is_active=True)
        logger.info("Created default organization", org_id=str(org.id))
    elif org_count == 1:
        org = await Organization.all().first()
        assert org is not None
    else:
        # Multi-org exists. We cannot safely infer where legacy roles should go.
        org = None

    if org is not None:
        # Org membership is the account-level linkage (single org per user).
        from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.modules.organization.models.user import User
        from apps.api.modules.workspaces.models.workspace import Workspace

        users = await User.filter(status=UserStatus.ACTIVE).all()
        created_org_memberships = 0
        for user in users:
            _, created2 = await OrgMembership.get_or_create(
                user_id=user.id,
                defaults={"organization_id": org.id, "role": OrgRole.MEMBER, "status": "active"},
            )
            if created2:
                created_org_memberships += 1

        # Ensure a default workspace exists for the default org (best-effort).
        if users and await Workspace.filter(organization_id=org.id).count() == 0:
            await Workspace.create(
                organization_id=org.id,
                slug="default",
                name=org.name,
                is_active=True,
                created_by_user_id=users[0].id,
            )

        if created_org_memberships:
            logger.info(
                "Ensured default memberships",
                org_memberships=created_org_memberships,
                org_id=str(org.id),
            )
