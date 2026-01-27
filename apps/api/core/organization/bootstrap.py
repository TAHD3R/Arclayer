from __future__ import annotations

from uuid import UUID

from apps.api.core.logging import get_logger
from apps.api.models.organization import MembershipStatus, Organization
from apps.api.models.rbac import MembershipRole, UserRole
from apps.api.models.user import UserStatus

logger = get_logger(__name__)


async def ensure_organization_ready() -> None:
    """
    Ensure organization/membership tables are usable after introducing tenant-scoped RBAC.

    This is an early-stage safety net to prevent locking yourself out after migrating from
    legacy global `user_roles` to org-scoped `membership_roles`.

    Behavior:
    - If there is no organization, create a default one.
    - Ensure every active user has an active membership in the default org.
    - If there is exactly one org and `membership_roles` is empty but `user_roles` has data,
      migrate `user_roles` -> `membership_roles` within that org.

    Notes:
    - The migration is idempotent (`get_or_create` based).
    - If there are multiple orgs, we skip auto-migration to avoid attaching roles to the wrong tenant.
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

    # Auto-migrate legacy user_roles -> membership_roles only if it's unambiguous.
    if org is None:
        return

    has_membership_roles = await MembershipRole.all().exists()
    if has_membership_roles:
        return

    has_user_roles = await UserRole.all().exists()
    if not has_user_roles:
        return

    from apps.api.models.organization import Membership

    # Map user_id -> membership_id for the chosen org.
    memberships = await Membership.filter(organization_id=org.id, status=MembershipStatus.ACTIVE).all()
    membership_by_user: dict[UUID, UUID] = {m.user_id: m.id for m in memberships}

    migrated = 0
    for row in await UserRole.all():
        membership_id = membership_by_user.get(row.user_id)
        if membership_id is None:
            # Shouldn't happen if we ensured memberships above, but keep it safe.
            continue
        _, created = await MembershipRole.get_or_create(membership_id=membership_id, role_id=row.role_id)
        if created:
            migrated += 1

    if migrated:
        logger.warning(
            "Migrated legacy user_roles into membership_roles (single-org safe path)",
            count=migrated,
            org_id=str(org.id),
        )
