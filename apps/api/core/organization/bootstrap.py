from __future__ import annotations

from apps.api.core.logging import get_logger
from apps.api.models.organization import MembershipStatus, Organization
from apps.api.models.user import UserStatus

logger = get_logger(__name__)


async def ensure_organization_ready() -> None:
    """
    Ensure organization/membership tables are usable after introducing tenant-scoped RBAC.

    Behavior:
    - If there is no organization, create a default one.
    - Ensure every active user has an active membership in the default org.

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
        # Ensure every active user has a membership for the default org.
        from apps.api.models.organization import Membership
        from apps.api.models.user import User

        users = await User.filter(status=UserStatus.ACTIVE).all()
        created_memberships = 0
        for user in users:
            _, created = await Membership.get_or_create(
                user_id=user.id,
                organization_id=org.id,
                defaults={"status": MembershipStatus.ACTIVE},
            )
            if created:
                created_memberships += 1
        if created_memberships:
            logger.info("Ensured default memberships", count=created_memberships, org_id=str(org.id))
