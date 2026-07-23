from __future__ import annotations

from asyncio import gather
from collections.abc import Iterable
from datetime import datetime
from typing import Any, cast
from uuid import UUID

from pydantic import ConfigDict
from tortoise.expressions import Case, F, Q, When
from tortoise.functions import Count, Sum
from tortoise.queryset import QuerySet

from src.common.schemas import BaseSchema
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.ai.ai_audit_log import AIAuditLog
from src.models.analytics.audit_event import AuditEvent
from src.models.auth.oauth_identity import OAuthIdentity
from src.models.auth.user_two_factor import UserTwoFactor, UserTwoFactorBackupCode
from src.models.commerce.billing import SubscriptionStatus
from src.models.content._enums import ContentReleaseStatus
from src.models.content.release import ContentReleaseRecord
from src.models.domains.domain_binding import DomainBindingCertificateStatus, DomainBindingRecord
from src.models.feedback.feedback import FeedbackTicket
from src.models.organization.org_membership import OrgMembership
from src.models.organization.organization import Organization
from src.models.organization.user import User, UserCredential, UserStatus
from src.models.projects.deployment import ProjectDeploymentRecord, ProjectDeploymentStatus
from src.models.projects.membership import ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeKind, ProjectRuntimeRecord
from src.models.sites.site import SiteRecord
from src.models.system.access_restriction import (
    AccessRestrictionCommandRecord,
    AccessRestrictionEntityType,
    AccessRestrictionRecord,
    AccessRestrictionState,
    AccessRestrictionType,
)
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.commerce.schema import WorkspaceCommerceDirectoryRisk
from src.modules.system.directory.schema import (
    DirectoryProjectListFilters,
    DirectoryUserListFilters,
    DirectoryWorkspaceListFilters,
)

_USER_ALLOWED_ORDER_FIELDS = {
    "created_at": "created_at",
    "username": "username",
    "email": "email",
    "status": "status",
    "is_super_admin": "is_super_admin",
    "last_login_at": "last_login_at",
}
_WORKSPACE_ALLOWED_ORDER_FIELDS = {
    "created_at": "created_at",
    "activity_at": "updated_at",
    "name": "name",
    "member_count": "member_count",
    "project_count": "project_count",
    "plan": "commerce_subscription__plan__sort_order",
    "credit_risk": "commerce_risk_rank",
    "renewal_at": "commerce_subscription__current_period_end",
}
_PROJECT_ALLOWED_ORDER_FIELDS = {
    "activity_at": "updated_at",
    "created_at": "created_at",
    "member_count": "member_count",
    "name": "name",
    "slug": "slug",
    "workspace_name": "workspace__name",
}


class ProjectOperationalFacts(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    project_id: UUID
    runtime_exists: bool
    runtime_active: bool
    site_exists: bool
    active_deployment_count: int
    degraded_active_deployment_count: int
    latest_deployment_status: ProjectDeploymentStatus | None
    latest_deployment_at: datetime | None
    domain_count: int
    verified_domain_count: int
    domain_attention_count: int
    latest_release_status: ContentReleaseStatus | None
    latest_release_number: int | None
    latest_release_at: datetime | None
    latest_audit_at: datetime | None
    usage_requests: int
    usage_prompt_tokens: int
    usage_completion_tokens: int
    usage_cost_micros: int


def _search_q(fields: Iterable[str], q: str | None) -> Q:
    query = (q or "").strip()
    if not query:
        return Q()

    predicates = [Q(**{f"{field}__icontains": query}) for field in fields]
    if not predicates:
        return Q()

    merged = predicates[0]
    for predicate in predicates[1:]:
        merged |= predicate
    return merged


def _normalize_ordering(value: str | None, allowed: dict[str, str], default: str) -> list[str]:
    fields: list[str] = []
    for part in str(value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        key = raw[1:] if desc else raw
        mapped = allowed.get(key)
        if mapped is None:
            continue
        fields.append(f"-{mapped}" if desc else mapped)
    return fields or [default]


def _ordering_keys(value: str | None) -> set[str]:
    return {raw.removeprefix("-") for part in str(value or "").split(",") if (raw := part.strip())}


def _workspace_commerce_missing_q() -> Q:
    return Q(commerce_subscription__isnull=True) | Q(credit_account__isnull=True)


def _workspace_commerce_attention_q() -> Q:
    return ~_workspace_commerce_missing_q() & (
        Q(commerce_subscription__status__in=[SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED])
        | Q(credit_account__balance_credits__lte=F("credit_account__reserved_credits"))
        | Q(credit_account__period_spent_credits__gt=F("credit_account__period_granted_credits"))
    )


def _workspace_commerce_risk_q(risk: WorkspaceCommerceDirectoryRisk) -> Q:
    if risk == WorkspaceCommerceDirectoryRisk.DATA_MISSING:
        return _workspace_commerce_missing_q()
    if risk == WorkspaceCommerceDirectoryRisk.ATTENTION_REQUIRED:
        return _workspace_commerce_attention_q()
    return ~_workspace_commerce_missing_q() & ~_workspace_commerce_attention_q()


def _workspace_commerce_risk_rank() -> Case:
    return Case(
        When(_workspace_commerce_missing_q(), then="2"),
        When(_workspace_commerce_attention_q(), then="1"),
        default="0",
    )


class SystemDirectoryRepository(TortoiseORMRepository):
    async def count_active_super_admins(self) -> int:
        return await User.filter(
            is_super_admin=True,
            status=UserStatus.ACTIVE,
        ).count()

    async def _user_security_filter_q(self, *, filters: DirectoryUserListFilters) -> Q:
        query = Q()
        if filters.status is not None:
            query &= Q(status=filters.status)
        if filters.is_super_admin is not None:
            query &= Q(is_super_admin=filters.is_super_admin)
        if filters.has_password is not None:
            rows = await UserCredential.all().values("user_id")
            ids = [row["user_id"] for row in rows]
            query &= Q(id__in=ids) if filters.has_password else ~Q(id__in=ids)
        if filters.two_factor_enabled is not None:
            rows = await UserTwoFactor.filter(enabled_at__not_isnull=True).values("user_id")
            ids = [row["user_id"] for row in rows]
            query &= Q(id__in=ids) if filters.two_factor_enabled else ~Q(id__in=ids)
        if filters.oauth_provider is not None:
            if filters.oauth_provider == "any":
                rows = await OAuthIdentity.all().values("user_id")
            elif filters.oauth_provider == "none":
                rows = await OAuthIdentity.all().values("user_id")
                ids = [row["user_id"] for row in rows]
                query &= ~Q(id__in=ids)
                return query
            else:
                rows = await OAuthIdentity.filter(provider=filters.oauth_provider).values("user_id")
            ids = [row["user_id"] for row in rows]
            query &= Q(id__in=ids)
        return query

    async def _workspace_owner_user_id(self, *, workspace_id: UUID) -> UUID | None:
        role_owner_id = (await self.list_workspace_owner_user_ids(workspace_ids=[workspace_id])).get(workspace_id)
        if role_owner_id is not None:
            return role_owner_id
        rows = await Workspace.filter(id=workspace_id, deleted_at__isnull=True).values("owner_user_id")
        owner_user_id = rows[0].get("owner_user_id") if rows else None
        return UUID(str(owner_user_id)) if owner_user_id is not None else None

    async def _project_owner_user_id(self, *, project_id: UUID) -> UUID | None:
        rows = await ProjectRecord.filter(id=project_id, workspace__deleted_at__isnull=True).values(
            "created_by_user_id"
        )
        owner_user_id = rows[0].get("created_by_user_id") if rows else None
        return UUID(str(owner_user_id)) if owner_user_id is not None else None

    async def _user_relationship_filter_q(self, *, filters: DirectoryUserListFilters) -> Q:
        query = Q()
        if filters.workspace_member_of_id is not None:
            query &= Q(
                workspace_memberships__workspace_id=filters.workspace_member_of_id,
                workspace_memberships__status=WorkspaceMembershipStatus.ACTIVE,
            )
        if filters.project_member_of_id is not None:
            query &= Q(project_memberships__project_id=filters.project_member_of_id)
        if filters.owned_workspace_id is not None:
            owner_id = await self._workspace_owner_user_id(workspace_id=filters.owned_workspace_id)
            query &= Q(id=owner_id) if owner_id is not None else Q(id__in=[])
        if filters.owned_project_id is not None:
            owner_id = await self._project_owner_user_id(project_id=filters.owned_project_id)
            query &= Q(id=owner_id) if owner_id is not None else Q(id__in=[])
        return query

    async def _user_filter_q(self, *, filters: DirectoryUserListFilters) -> Q:
        query = await self._user_security_filter_q(filters=filters)
        query &= await self._user_relationship_filter_q(filters=filters)
        if filters.created_from is not None:
            query &= Q(created_at__gte=filters.created_from)
        if filters.created_to is not None:
            query &= Q(created_at__lte=filters.created_to)
        if filters.last_login_from is not None:
            query &= Q(last_login_at__gte=filters.last_login_from)
        if filters.last_login_to is not None:
            query &= Q(last_login_at__lte=filters.last_login_to)
        return query

    async def count_users(self, *, q: str | None, filters: DirectoryUserListFilters) -> int:
        return await User.filter(
            _search_q(("username", "email", "display_name"), q),
            await self._user_filter_q(filters=filters),
        ).count()

    async def list_users_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryUserListFilters,
        offset: int,
        limit: int,
    ) -> list[User]:
        queryset = User.filter(
            _search_q(("username", "email", "display_name"), q),
            await self._user_filter_q(filters=filters),
        )
        return (
            await queryset
            .order_by(*_normalize_ordering(ordering, _USER_ALLOWED_ORDER_FIELDS, "-created_at"))
            .offset(offset)
            .limit(limit)
        )

    async def _active_restriction_entity_ids(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        restriction_type: AccessRestrictionType,
    ) -> list[UUID]:
        rows = await AccessRestrictionRecord.filter(
            entity_type=entity_type,
            restriction_type=restriction_type,
            state=AccessRestrictionState.ACTIVE,
        ).values_list("entity_id", flat=True)
        return [UUID(str(entity_id)) for entity_id in rows]

    async def _workspace_filter_q(self, *, filters: DirectoryWorkspaceListFilters) -> Q:
        query = Q()
        if filters.owner_user_id is not None:
            owned_workspace_ids = await self.list_owned_workspace_ids_by_user(
                user_id=filters.owner_user_id,
            )
            query &= Q(id__in=owned_workspace_ids)
        if filters.is_active is not None:
            suspended_ids = await self._active_restriction_entity_ids(
                entity_type=AccessRestrictionEntityType.WORKSPACE,
                restriction_type=AccessRestrictionType.WORKSPACE_SUSPENDED,
            )
            query &= ~Q(id__in=suspended_ids) if filters.is_active else Q(id__in=suspended_ids)
        if filters.is_archived is not None:
            archived_ids = await self._active_restriction_entity_ids(
                entity_type=AccessRestrictionEntityType.WORKSPACE,
                restriction_type=AccessRestrictionType.WORKSPACE_ARCHIVED,
            )
            query &= Q(id__in=archived_ids) if filters.is_archived else ~Q(id__in=archived_ids)
        if filters.plan_code is not None:
            query &= Q(commerce_subscription__plan__code=filters.plan_code)
        if filters.subscription_status is not None:
            query &= Q(commerce_subscription__status=filters.subscription_status)
        if filters.commerce_risk is not None:
            query &= _workspace_commerce_risk_q(filters.commerce_risk)
        if filters.created_from is not None:
            query &= Q(created_at__gte=filters.created_from)
        if filters.created_to is not None:
            query &= Q(created_at__lte=filters.created_to)
        if filters.activity_from is not None:
            query &= Q(updated_at__gte=filters.activity_from)
        if filters.activity_to is not None:
            query &= Q(updated_at__lte=filters.activity_to)
        return query

    async def _workspace_queryset(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryWorkspaceListFilters,
    ) -> QuerySet[Workspace]:
        queryset = Workspace.filter(deleted_at__isnull=True).filter(
            _search_q(("name", "description"), q),
            await self._workspace_filter_q(filters=filters),
        )
        ordering_keys = _ordering_keys(ordering)
        if "credit_risk" in ordering_keys:
            return queryset.annotate(
                commerce_subscription_status=F("commerce_subscription__status"),
                commerce_credit_balance=F("credit_account__balance_credits"),
                commerce_credit_reserved=F("credit_account__reserved_credits"),
                commerce_period_spent=F("credit_account__period_spent_credits"),
                commerce_period_granted=F("credit_account__period_granted_credits"),
                commerce_risk_rank=_workspace_commerce_risk_rank(),
            )
        count_annotations = {}
        if "member_count" in ordering_keys:
            count_annotations["member_count"] = Count(
                "memberships",
                distinct=True,
                _filter=Q(memberships__status=WorkspaceMembershipStatus.ACTIVE),
            )
        if "project_count" in ordering_keys:
            count_annotations["project_count"] = Count("projects", distinct=True)
        if count_annotations:
            return queryset.annotate(**count_annotations)
        return queryset

    async def _project_filter_q(
        self,
        *,
        filters: DirectoryProjectListFilters,
        operational_project_ids: set[UUID] | None,
    ) -> Q:
        query = Q()
        if filters.workspace_id is not None:
            query &= Q(workspace_id=filters.workspace_id)
        if filters.owner_user_id is not None:
            query &= Q(created_by_user_id=filters.owner_user_id)
        if filters.is_active is not None:
            suspended_ids = await self._active_restriction_entity_ids(
                entity_type=AccessRestrictionEntityType.PROJECT,
                restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
            )
            query &= ~Q(id__in=suspended_ids) if filters.is_active else Q(id__in=suspended_ids)
        if filters.created_from is not None:
            query &= Q(created_at__gte=filters.created_from)
        if filters.created_to is not None:
            query &= Q(created_at__lte=filters.created_to)
        if filters.activity_from is not None:
            query &= Q(updated_at__gte=filters.activity_from)
        if filters.activity_to is not None:
            query &= Q(updated_at__lte=filters.activity_to)
        if operational_project_ids is not None:
            query &= Q(id__in=operational_project_ids)
        return query

    async def count_workspaces(self, *, q: str | None, filters: DirectoryWorkspaceListFilters) -> int:
        return (
            await Workspace
            .filter(deleted_at__isnull=True)
            .filter(
                _search_q(("name", "description"), q),
                await self._workspace_filter_q(filters=filters),
            )
            .count()
        )

    async def list_workspaces_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryWorkspaceListFilters,
        offset: int,
        limit: int,
    ) -> list[Workspace]:
        queryset = await self._workspace_queryset(q=q, ordering=ordering, filters=filters)
        return (
            await queryset
            .order_by(*_normalize_ordering(ordering, _WORKSPACE_ALLOWED_ORDER_FIELDS, "-created_at"))
            .offset(offset)
            .limit(limit)
        )

    async def count_projects(
        self,
        *,
        q: str | None,
        filters: DirectoryProjectListFilters,
        operational_project_ids: set[UUID] | None,
    ) -> int:
        return (
            await ProjectRecord
            .filter(workspace__deleted_at__isnull=True)
            .filter(
                _search_q(("name", "slug", "description", "workspace__name"), q),
                await self._project_filter_q(
                    filters=filters,
                    operational_project_ids=operational_project_ids,
                ),
            )
            .count()
        )

    async def list_projects_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryProjectListFilters,
        operational_project_ids: set[UUID] | None,
        offset: int,
        limit: int,
    ) -> list[ProjectRecord]:
        queryset = (
            ProjectRecord
            .filter(workspace__deleted_at__isnull=True)
            .filter(
                _search_q(("name", "slug", "description", "workspace__name"), q),
                await self._project_filter_q(
                    filters=filters,
                    operational_project_ids=operational_project_ids,
                ),
            )
            .prefetch_related("workspace")
        )
        if "member_count" in _ordering_keys(ordering):
            queryset = queryset.annotate(member_count=Count("memberships", distinct=True))
        return (
            await queryset
            .order_by(*_normalize_ordering(ordering, _PROJECT_ALLOWED_ORDER_FIELDS, "-created_at"))
            .offset(offset)
            .limit(limit)
        )

    async def list_project_record_activity(
        self,
        *,
        project_ids: Iterable[UUID] | None = None,
    ) -> dict[UUID, datetime]:
        query = ProjectRecord.filter(workspace__deleted_at__isnull=True)
        if project_ids is not None:
            ids = list(set(project_ids))
            if not ids:
                return {}
            query = query.filter(id__in=ids)
        rows = await query.values("id", "updated_at")
        return {UUID(str(row["id"])): cast(datetime, row["updated_at"]) for row in rows}

    async def list_project_operational_facts(
        self,
        *,
        project_ids: Iterable[UUID],
        usage_start: datetime,
        usage_end: datetime,
    ) -> dict[UUID, ProjectOperationalFacts]:
        ids = list(dict.fromkeys(project_ids))
        if not ids:
            return {}
        gathered = await gather(
            ProjectRuntimeRecord.filter(project_id__in=ids, kind=ProjectRuntimeKind.PRIMARY).values(
                "project_id", "is_active"
            ),
            SiteRecord.filter(project_id__in=ids).values("id", "project_id", "is_active"),
            ProjectDeploymentRecord
            .filter(project_id__in=ids)
            .order_by("project_id", "-created_at")
            .values("project_id", "status", "is_active", "created_at"),
            DomainBindingRecord.filter(project_id__in=ids, is_active=True).values(
                "project_id", "is_verified", "certificate_status"
            ),
            AuditEvent
            .filter(project_id__in=ids)
            .order_by("project_id", "-occurred_at")
            .values("project_id", "occurred_at"),
            cast(
                Any,
                AIAuditLog
                .filter(
                    project_id__in=ids,
                    created_at__gte=usage_start,
                    created_at__lt=usage_end,
                )
                .annotate(
                    usage_requests=Count("id"),
                    usage_prompt_tokens=Sum("prompt_tokens"),
                    usage_completion_tokens=Sum("completion_tokens"),
                    usage_cost_micros=Sum("cost_micros"),
                )
                .group_by("project_id")
                .values(
                    "project_id",
                    "usage_requests",
                    "usage_prompt_tokens",
                    "usage_completion_tokens",
                    "usage_cost_micros",
                ),
            ),
        )
        runtime_rows = cast(list[dict[str, Any]], gathered[0])
        site_rows = cast(list[dict[str, Any]], gathered[1])
        deployment_rows = cast(list[dict[str, Any]], gathered[2])
        domain_rows = cast(list[dict[str, Any]], gathered[3])
        audit_rows = cast(list[dict[str, Any]], gathered[4])
        usage_rows = cast(list[dict[str, Any]], gathered[5])
        site_to_project = {UUID(str(row["id"])): UUID(str(row["project_id"])) for row in site_rows}
        release_rows = (
            await ContentReleaseRecord
            .filter(site_id__in=list(site_to_project))
            .order_by("site_id", "-created_at")
            .values("site_id", "status", "release_number", "created_at")
            if site_to_project
            else []
        )
        return self._build_project_operational_facts(
            project_ids=ids,
            runtime_rows=runtime_rows,
            site_rows=site_rows,
            deployment_rows=deployment_rows,
            domain_rows=domain_rows,
            audit_rows=audit_rows,
            usage_rows=usage_rows,
            release_rows=release_rows,
            site_to_project=site_to_project,
        )

    @staticmethod
    def _build_project_operational_facts(
        *,
        project_ids: list[UUID],
        runtime_rows: list[dict[str, Any]],
        site_rows: list[dict[str, Any]],
        deployment_rows: list[dict[str, Any]],
        domain_rows: list[dict[str, Any]],
        audit_rows: list[dict[str, Any]],
        usage_rows: list[dict[str, Any]],
        release_rows: list[dict[str, Any]],
        site_to_project: dict[UUID, UUID],
    ) -> dict[UUID, ProjectOperationalFacts]:
        runtime_active = {UUID(str(row["project_id"])): bool(row["is_active"]) for row in runtime_rows}
        site_active = {UUID(str(row["project_id"])): bool(row["is_active"]) for row in site_rows}
        deployments: dict[UUID, list[dict[str, Any]]] = {}
        domains: dict[UUID, list[dict[str, Any]]] = {}
        for row in deployment_rows:
            deployments.setdefault(UUID(str(row["project_id"])), []).append(row)
        for row in domain_rows:
            domains.setdefault(UUID(str(row["project_id"])), []).append(row)
        latest_audit: dict[UUID, datetime] = {}
        for row in audit_rows:
            project_id = UUID(str(row["project_id"]))
            latest_audit.setdefault(project_id, cast(datetime, row["occurred_at"]))
        usage = {UUID(str(row["project_id"])): row for row in usage_rows}
        releases: dict[UUID, dict[str, Any]] = {}
        for row in release_rows:
            project_id = site_to_project[UUID(str(row["site_id"]))]
            releases.setdefault(project_id, row)

        result: dict[UUID, ProjectOperationalFacts] = {}
        for project_id in project_ids:
            project_deployments = deployments.get(project_id, [])
            active_deployments = [row for row in project_deployments if bool(row["is_active"])]
            degraded = [
                row
                for row in active_deployments
                if str(row["status"]) in {ProjectDeploymentStatus.FAILED.value, ProjectDeploymentStatus.CANCELED.value}
            ]
            project_domains = domains.get(project_id, [])
            attention_domains = [
                row
                for row in project_domains
                if not bool(row["is_verified"])
                or str(row["certificate_status"])
                in {DomainBindingCertificateStatus.PENDING.value, DomainBindingCertificateStatus.ERROR.value}
            ]
            latest_deployment = project_deployments[0] if project_deployments else None
            latest_release = releases.get(project_id)
            project_usage = usage.get(project_id, {})
            result[project_id] = ProjectOperationalFacts(
                project_id=project_id,
                runtime_exists=project_id in runtime_active,
                runtime_active=runtime_active.get(project_id, False) and site_active.get(project_id, False),
                site_exists=project_id in site_active,
                active_deployment_count=len(active_deployments),
                degraded_active_deployment_count=len(degraded),
                latest_deployment_status=(
                    ProjectDeploymentStatus(str(latest_deployment["status"])) if latest_deployment else None
                ),
                latest_deployment_at=(cast(datetime, latest_deployment["created_at"]) if latest_deployment else None),
                domain_count=len(project_domains),
                verified_domain_count=sum(bool(row["is_verified"]) for row in project_domains),
                domain_attention_count=len(attention_domains),
                latest_release_status=(ContentReleaseStatus(str(latest_release["status"])) if latest_release else None),
                latest_release_number=int(latest_release["release_number"]) if latest_release else None,
                latest_release_at=cast(datetime, latest_release["created_at"]) if latest_release else None,
                latest_audit_at=latest_audit.get(project_id),
                usage_requests=int(project_usage.get("usage_requests") or 0),
                usage_prompt_tokens=int(project_usage.get("usage_prompt_tokens") or 0),
                usage_completion_tokens=int(project_usage.get("usage_completion_tokens") or 0),
                usage_cost_micros=int(project_usage.get("usage_cost_micros") or 0),
            )
        return result

    async def get_user_by_id(self, *, user_id: UUID) -> User | None:
        return await User.filter(id=user_id).get_or_none()

    async def get_organization_by_id(self, *, organization_id: UUID) -> Organization | None:
        return await Organization.filter(id=organization_id, deleted_at__isnull=True).get_or_none()

    async def get_workspace_by_id(self, *, workspace_id: UUID) -> Workspace | None:
        return await Workspace.filter(id=workspace_id, deleted_at__isnull=True).get_or_none()

    async def get_project_by_id(self, *, project_id: UUID) -> ProjectRecord | None:
        return (
            await ProjectRecord
            .filter(id=project_id, workspace__deleted_at__isnull=True)
            .prefetch_related(
                "workspace",
            )
            .get_or_none()
        )

    async def project_slug_exists(
        self,
        *,
        workspace_id: UUID,
        slug: str,
        exclude_project_id: UUID | None = None,
    ) -> bool:
        query = ProjectRecord.filter(workspace_id=workspace_id, slug=slug, workspace__deleted_at__isnull=True)
        if exclude_project_id is not None:
            query = query.exclude(id=exclude_project_id)
        return await query.exists()

    async def get_users_by_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, User]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await User.filter(id__in=ids)
        return {UUID(str(row.id)): row for row in rows}

    async def get_users_with_credentials_by_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, User]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await User.filter(id__in=ids).prefetch_related("credential")
        return {UUID(str(row.id)): row for row in rows}

    async def get_user_with_credential_by_id(self, *, user_id: UUID) -> User | None:
        return await User.filter(id=user_id).prefetch_related("credential").get_or_none()

    async def list_user_workspace_memberships(self, *, user_id: UUID) -> list[WorkspaceMembership]:
        return (
            await WorkspaceMembership
            .filter(user_id=user_id, workspace__deleted_at__isnull=True)
            .select_related("workspace")
            .prefetch_related("membership_roles__role")
            .order_by("workspace__name", "created_at")
        )

    async def list_user_project_memberships(self, *, user_id: UUID) -> list[ProjectMembership]:
        return (
            await ProjectMembership
            .filter(user_id=user_id, project__workspace__deleted_at__isnull=True)
            .select_related("project", "project__workspace")
            .order_by("project__name", "created_at")
        )

    async def list_recent_user_audit_activity(self, *, user_id: UUID, limit: int = 8) -> list[AuditEvent]:
        return (
            await AuditEvent
            .filter(Q(actor_user_id=user_id) | Q(subject_user_id=user_id))
            .order_by("-occurred_at", "-id")
            .limit(limit)
        )

    async def list_recent_user_feedback_activity(
        self,
        *,
        user_id: UUID,
        limit: int = 8,
    ) -> list[FeedbackTicket]:
        return await FeedbackTicket.filter(reporter_user_id=user_id).order_by("-last_activity_at", "-id").limit(limit)

    async def list_user_restriction_history(
        self,
        *,
        user_id: UUID,
        limit: int = 20,
    ) -> list[AccessRestrictionCommandRecord]:
        return (
            await AccessRestrictionCommandRecord
            .filter(entity_type=AccessRestrictionEntityType.USER, entity_id=user_id)
            .order_by("-created_at", "-id")
            .limit(limit)
        )

    async def list_linked_oauth_providers_by_user_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, list[str]]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await OAuthIdentity.filter(user_id__in=ids).values("user_id", "provider")
        providers_by_user: dict[UUID, list[str]] = {}
        for row in rows:
            key = UUID(str(row["user_id"]))
            provider = str(row["provider"] or "").strip().lower()
            if not provider:
                continue
            providers = providers_by_user.setdefault(key, [])
            if provider not in providers:
                providers.append(provider)
        for providers in providers_by_user.values():
            providers.sort()
        return providers_by_user

    async def list_two_factor_enabled_user_ids(self, *, user_ids: Iterable[UUID]) -> set[UUID]:
        ids = list(set(user_ids))
        if not ids:
            return set()
        rows = await UserTwoFactor.filter(user_id__in=ids, enabled_at__not_isnull=True).values("user_id")
        return {UUID(str(row["user_id"])) for row in rows}

    async def delete_user_two_factor(self, *, user_id: UUID) -> None:
        await UserTwoFactorBackupCode.filter(user_id=user_id).delete()
        await UserTwoFactor.filter(user_id=user_id).delete()

    async def delete_user_linked_oauth_provider(self, *, user_id: UUID, provider: str) -> int:
        provider_key = str(provider or "").strip().lower()
        if not provider_key:
            return 0
        return await OAuthIdentity.filter(user_id=user_id, provider=provider_key).delete()

    async def delete_user_linked_oauth_identities(self, *, user_id: UUID) -> int:
        return await OAuthIdentity.filter(user_id=user_id).delete()

    async def user_has_password(self, *, user_id: UUID) -> bool:
        return await UserCredential.filter(user_id=user_id).exists()

    async def delete_user_credentials(self, *, user_id: UUID) -> int:
        return await UserCredential.filter(user_id=user_id).delete()

    async def disable_user_workspace_memberships(self, *, user_id: UUID) -> int:
        from src.llm.keys import revoke_user_grants_for_workspace

        memberships = await WorkspaceMembership.filter(user_id=user_id, status=WorkspaceMembershipStatus.ACTIVE).all()
        for m in memberships:
            await revoke_user_grants_for_workspace(
                user_id=user_id,
                workspace_id=m.workspace_id,
            )
        return await WorkspaceMembership.filter(user_id=user_id).update(
            status=WorkspaceMembershipStatus.DISABLED,
        )

    async def delete_user_org_memberships(self, *, user_id: UUID) -> int:
        return await OrgMembership.filter(user_id=user_id).delete()

    async def delete_user_project_memberships(self, *, user_id: UUID) -> int:
        return await ProjectMembership.filter(user_id=user_id).delete()

    async def list_owned_organization_ids_by_user(self, *, user_id: UUID) -> list[UUID]:
        rows = await Organization.filter(owner_user_id=user_id, deleted_at__isnull=True).values_list("id", flat=True)
        return [UUID(str(row)) for row in rows]

    async def list_owned_workspace_ids_by_user(self, *, user_id: UUID) -> list[UUID]:
        from src.modules.system.rbac.constants.service import ROLE_OWNER

        membership_rows = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            workspace__deleted_at__isnull=True,
            membership_roles__role__code=ROLE_OWNER,
        ).values_list("workspace_id", flat=True)
        workspace_rows = await Workspace.filter(owner_user_id=user_id, deleted_at__isnull=True).values_list(
            "id",
            flat=True,
        )
        return sorted({UUID(str(row)) for row in [*membership_rows, *workspace_rows]})

    async def list_created_project_ids_by_user(self, *, user_id: UUID) -> list[UUID]:
        rows = await ProjectRecord.filter(
            created_by_user_id=user_id,
            workspace__deleted_at__isnull=True,
        ).values_list("id", flat=True)
        return [UUID(str(row)) for row in rows]

    async def delete_workspaces_by_ids(self, *, workspace_ids: Iterable[UUID]) -> int:
        ids = list(set(workspace_ids))
        if not ids:
            return 0
        return await Workspace.filter(id__in=ids).delete()

    async def delete_projects_by_ids(self, *, project_ids: Iterable[UUID]) -> int:
        ids = list(set(project_ids))
        if not ids:
            return 0
        return await ProjectRecord.filter(id__in=ids).delete()

    async def list_workspace_owner_user_ids(self, *, workspace_ids: Iterable[UUID]) -> dict[UUID, UUID]:
        from src.modules.system.rbac.constants.service import ROLE_OWNER

        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = (
            await WorkspaceMembership
            .filter(
                workspace_id__in=ids,
                status=WorkspaceMembershipStatus.ACTIVE,
                membership_roles__role__code=ROLE_OWNER,
                membership_roles__role__workspace_id__in=ids,
            )
            .order_by("created_at", "id")
            .values("workspace_id", "user_id")
        )
        owner_ids_by_workspace: dict[UUID, UUID] = {}
        for row in rows:
            workspace_id = UUID(str(row["workspace_id"]))
            if workspace_id in owner_ids_by_workspace:
                continue
            owner_ids_by_workspace[workspace_id] = UUID(str(row["user_id"]))
        return owner_ids_by_workspace

    async def count_workspace_memberships_by_user_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await WorkspaceMembership.filter(
            user_id__in=ids,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).values("user_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["user_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_project_memberships_by_user_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await ProjectMembership.filter(user_id__in=ids).values("user_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["user_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_workspace_memberships_by_workspace_ids(self, *, workspace_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = await WorkspaceMembership.filter(
            workspace_id__in=ids,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).values("workspace_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["workspace_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_projects_by_workspace_ids(self, *, workspace_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = await ProjectRecord.filter(workspace_id__in=ids).values("workspace_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["workspace_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_project_memberships_by_project_ids(self, *, project_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(project_ids))
        if not ids:
            return {}
        rows = await ProjectMembership.filter(project_id__in=ids).values("project_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["project_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts
