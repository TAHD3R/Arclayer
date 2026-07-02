from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.common.utils.slug import slugify
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeKind, ProjectRuntimeRecord
from src.models.sites.site import SiteRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus

_PROJECT_ALLOWED_ORDER_FIELDS = {
    "created_at": "created_at",
    "updated_at": "updated_at",
    "name": "name",
}
PROJECT_RESERVED_SLUGS = frozenset({
    "admin",
    "api",
    "www",
    "auth",
    "login",
    "dashboard",
    "studio",
    "preview",
    "editor",
    "debug",
    "assets",
    "static",
    "system",
})
_PROJECT_SLUG_MAX_LENGTH = 64


def _normalize_project_ordering(value: str | None) -> list[str]:
    fields: list[str] = []
    for part in str(value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        key = raw[1:] if desc else raw
        mapped = _PROJECT_ALLOWED_ORDER_FIELDS.get(key)
        if mapped is None:
            raise BadRequest("Unsupported project ordering field", error="PROJECT_ORDERING_FIELD_UNSUPPORTED")
        fields.append(f"-{mapped}" if desc else mapped)

    if not fields:
        fields.append("created_at")
    fields.append("id")
    return fields


class ProjectRepository(TortoiseORMRepository):
    async def list_projects(
        self,
        *,
        workspace_id: UUID | None = None,
        user_id: UUID | None = None,
        q: str | None = None,
        is_active: bool | None = True,
        ordering: str | None = None,
    ) -> Sequence[ProjectRecord]:
        qs = ProjectRecord.all()
        if workspace_id is not None:
            qs = qs.filter(workspace_id=workspace_id)
        if user_id is not None:
            workspace_ids = await self.list_visible_workspace_ids(user_id=user_id)
            if not workspace_ids:
                return []
            qs = qs.filter(workspace_id__in=workspace_ids)
        if is_active is not None:
            qs = qs.filter(is_active=is_active)
        normalized_query = (q or "").strip()
        if normalized_query:
            qs = qs.filter(
                Q(name__icontains=normalized_query)
                | Q(slug__icontains=normalized_query)
                | Q(description__icontains=normalized_query)
            )
        return await qs.order_by(*_normalize_project_ordering(ordering)).all()

    async def list_visible_workspace_ids(self, *, user_id: UUID) -> list[UUID]:
        membership_workspace_ids = [
            UUID(str(value))
            for value in await WorkspaceMembership.filter(
                user_id=user_id,
                status=WorkspaceMembershipStatus.ACTIVE,
                workspace__is_active=True,
                workspace__deleted_at__isnull=True,
            ).values_list("workspace_id", flat=True)
            if value is not None
        ]

        org_memberships = await OrgMembership.filter(user_id=user_id, status="active").all()
        owner_org_ids = [
            UUID(str(membership.organization_id)) for membership in org_memberships if membership.role == OrgRole.OWNER
        ]
        owner_workspace_ids: list[UUID] = []
        if owner_org_ids:
            owner_workspace_ids = [
                UUID(str(value))
                for value in await Workspace.filter(
                    organization_id__in=owner_org_ids,
                    is_active=True,
                    deleted_at__isnull=True,
                ).values_list("id", flat=True)
                if value is not None
            ]

        seen: set[UUID] = set()
        ordered_ids: list[UUID] = []
        for workspace_id in [*membership_workspace_ids, *owner_workspace_ids]:
            if workspace_id in seen:
                continue
            seen.add(workspace_id)
            ordered_ids.append(workspace_id)
        return ordered_ids

    async def get_first_project_by_workspace_id(self, *, workspace_id: UUID) -> ProjectRecord | None:
        return await ProjectRecord.filter(workspace_id=workspace_id).order_by("created_at", "id").first()

    async def get_project_by_id(self, *, project_id: UUID) -> ProjectRecord:
        project = await ProjectRecord.get_or_none(id=project_id)
        if project is None:
            raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
        return project

    async def get_project_by_id_in_connection(
        self,
        *,
        project_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ProjectRecord:
        project = await ProjectRecord.get_or_none(id=project_id, using_db=conn)
        if project is None:
            raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
        return project

    async def get_project_with_workspace(self, *, project_id: UUID) -> tuple[ProjectRecord, Workspace]:
        project = await self.get_project_by_id(project_id=project_id)
        workspace = await Workspace.get_or_none(id=project.workspace_id, deleted_at__isnull=True)
        if workspace is None:
            raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")
        return project, workspace

    async def slug_exists(
        self,
        *,
        workspace_id: UUID,
        slug: str,
        exclude_project_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        qs = ProjectRecord.filter(workspace_id=workspace_id, slug=slug)
        if conn is not None:
            qs = qs.using_db(conn)
        if exclude_project_id is not None:
            qs = qs.exclude(id=exclude_project_id)
        return await qs.exists()

    async def _next_available_slug(
        self,
        *,
        workspace_id: UUID,
        name: str,
        reserved_slugs: frozenset[str],
        conn: BaseDBAsyncClient | None = None,
    ) -> str:
        base_slug = slugify(name)[:_PROJECT_SLUG_MAX_LENGTH] or "project"
        slug = base_slug
        suffix = 2
        while slug in reserved_slugs or await self.slug_exists(
            workspace_id=workspace_id,
            slug=slug,
            conn=conn,
        ):
            suffix_text = f"-{suffix}"
            max_base_length = max(1, _PROJECT_SLUG_MAX_LENGTH - len(suffix_text))
            slug = f"{base_slug[:max_base_length].rstrip('-')}{suffix_text}"
            suffix += 1
        return slug

    async def check_slug_availability(
        self,
        *,
        workspace_id: UUID,
        slug: str,
        exclude_project_id: UUID | None = None,
        reserved_slugs: frozenset[str] = PROJECT_RESERVED_SLUGS,
    ) -> tuple[str | None, str | None]:
        normalized_slug = slugify(slug)[:_PROJECT_SLUG_MAX_LENGTH]
        if not normalized_slug or normalized_slug == "asset":
            return None, "invalid"
        if normalized_slug in reserved_slugs:
            return normalized_slug, "reserved"
        exists = await self.slug_exists(
            workspace_id=workspace_id,
            slug=normalized_slug,
            exclude_project_id=exclude_project_id,
        )
        if exists:
            return normalized_slug, "exists"
        return normalized_slug, None

    async def create_project(
        self,
        *,
        workspace_id: UUID,
        name: str,
        slug: str | None,
        description: str | None,
        actor_user_id: UUID | None,
        reserved_slugs: frozenset[str] = PROJECT_RESERVED_SLUGS,
        conn: BaseDBAsyncClient | None = None,
    ) -> ProjectRecord:
        resolved_slug = slug or await self._next_available_slug(
            workspace_id=workspace_id,
            name=name,
            reserved_slugs=reserved_slugs,
            conn=conn,
        )
        if resolved_slug in reserved_slugs:
            raise BadRequest("Project slug is reserved", error="PROJECT_SLUG_RESERVED")
        if await self.slug_exists(workspace_id=workspace_id, slug=resolved_slug, conn=conn):
            raise Conflict("Project slug already exists", error="PROJECT_SLUG_EXISTS")

        return await ProjectRecord.create(
            using_db=conn,
            workspace_id=workspace_id,
            slug=resolved_slug,
            name=name[:128],
            description=description,
            is_active=True,
            created_by_user_id=actor_user_id,
        )

    async def bootstrap_project_memberships(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        existing_query = ProjectMembership.filter(project_id=project_id)
        if conn is not None:
            existing_query = existing_query.using_db(conn)
        existing = await existing_query.exists()
        if existing:
            return

        workspace = await Workspace.get_or_none(id=workspace_id, using_db=conn)
        if workspace is None:
            raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")

        workspace_membership_query = WorkspaceMembership.filter(
            workspace_id=workspace_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        if conn is not None:
            workspace_membership_query = workspace_membership_query.using_db(conn)
        workspace_user_ids = {
            UUID(str(value))
            for value in await workspace_membership_query.values_list("user_id", flat=True)
            if value is not None
        }

        owner_query = OrgMembership.filter(
            organization_id=workspace.organization_id,
            status="active",
            role=OrgRole.OWNER,
        )
        if conn is not None:
            owner_query = owner_query.using_db(conn)
        owner_user_ids = {UUID(str(value)) for value in await owner_query.values_list("user_id", flat=True) if value}
        member_user_ids = workspace_user_ids | owner_user_ids | {actor_user_id}
        if not member_user_ids:
            return

        rows = [
            ProjectMembership(
                project_id=project_id,
                user_id=user_id,
                role=ProjectMemberRole.OWNER if user_id in owner_user_ids else ProjectMemberRole.VIEWER,
                created_by_user_id=actor_user_id,
            )
            for user_id in sorted(member_user_ids)
        ]
        if rows:
            await ProjectMembership.bulk_create(rows, ignore_conflicts=True, using_db=conn)

    async def update_project(
        self,
        *,
        project_id: UUID,
        name: str | None,
        slug: str | None,
        description: str | None,
        description_provided: bool,
        icon_mode: str | None,
        icon_color: str | None,
        icon_glyph: str | None,
        icon_emoji: str | None,
        icon_url: str | None,
        icon_fields_provided: bool,
        reserved_slugs: frozenset[str] = PROJECT_RESERVED_SLUGS,
        conn: BaseDBAsyncClient | None = None,
    ) -> ProjectRecord:
        project = (
            await self.get_project_by_id(project_id=project_id)
            if conn is None
            else await self.get_project_by_id_in_connection(project_id=project_id, conn=conn)
        )
        update_fields: list[str] = []

        if name is not None:
            project.name = name[:128]
            update_fields.append("name")

        if slug is not None:
            if slug in reserved_slugs:
                raise BadRequest("Project slug is reserved", error="PROJECT_SLUG_RESERVED")
            if await self.slug_exists(
                workspace_id=UUID(str(project.workspace_id)),
                slug=slug,
                exclude_project_id=project_id,
            ):
                raise Conflict("Project slug already exists", error="PROJECT_SLUG_EXISTS")
            project.slug = slug
            update_fields.append("slug")

        if description_provided:
            project.description = description
            update_fields.append("description")

        if icon_fields_provided:
            if icon_mode is not None:
                project.icon_mode = icon_mode
                update_fields.append("icon_mode")
            if icon_color is not None:
                project.icon_color = icon_color
                update_fields.append("icon_color")
            project.icon_glyph = icon_glyph if (icon_mode == "glyph" or icon_glyph is None) else None
            project.icon_emoji = icon_emoji if (icon_mode == "emoji" or icon_emoji is None) else None
            project.icon_url = icon_url if (icon_mode == "image" or icon_url is None) else None
            update_fields.extend(["icon_glyph", "icon_emoji", "icon_url"])

        if update_fields:
            await project.save(update_fields=[*dict.fromkeys([*update_fields, "updated_at"])], using_db=conn)
        return (
            await self.get_project_by_id(project_id=project_id)
            if conn is None
            else await self.get_project_by_id_in_connection(project_id=project_id, conn=conn)
        )

    async def set_project_active(
        self,
        *,
        project_id: UUID,
        is_active: bool,
        conn: BaseDBAsyncClient | None = None,
    ) -> ProjectRecord:
        project = (
            await self.get_project_by_id(project_id=project_id)
            if conn is None
            else await self.get_project_by_id_in_connection(project_id=project_id, conn=conn)
        )
        if bool(project.is_active) != is_active:
            project.is_active = is_active
            await project.save(update_fields=["is_active", "updated_at"], using_db=conn)
        return (
            await self.get_project_by_id(project_id=project_id)
            if conn is None
            else await self.get_project_by_id_in_connection(project_id=project_id, conn=conn)
        )

    async def delete_project(self, *, project_id: UUID, conn: BaseDBAsyncClient | None = None) -> bool:
        project = (
            await self.get_project_by_id(project_id=project_id)
            if conn is None
            else await self.get_project_by_id_in_connection(project_id=project_id, conn=conn)
        )
        await project.delete(using_db=conn)
        query = ProjectRecord.filter(id=project_id)
        if conn is not None:
            query = query.using_db(conn)
        return not await query.exists()

    async def list_project_memberships(self, *, project_ids: list[UUID]) -> list[ProjectMembership]:
        if not project_ids:
            return []
        return (
            await ProjectMembership
            .filter(project_id__in=project_ids)
            .select_related("user")
            .order_by("project_id", "created_at", "id")
            .all()
        )

    async def list_users(self, *, user_ids: Sequence[UUID]) -> list[User]:
        if not user_ids:
            return []
        return await User.filter(id__in=list(user_ids)).all()

    async def get_or_create_primary_project_for_workspace(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID | None,
    ) -> ProjectRecord:
        existing = await self.get_first_project_by_workspace_id(workspace_id=workspace_id)
        if existing is not None:
            return existing

        workspace = await Workspace.get_or_none(id=workspace_id)
        if workspace is None:
            raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")

        return await ProjectRecord.create(
            workspace_id=workspace_id,
            slug=await self._next_available_slug(
                workspace_id=workspace_id,
                name=workspace.name or "Project",
                reserved_slugs=PROJECT_RESERVED_SLUGS,
            ),
            name=(workspace.name or "Project")[:128],
            description=workspace.description,
            icon_mode=workspace.icon_mode,
            icon_color=workspace.icon_color,
            icon_glyph=workspace.icon_glyph,
            icon_emoji=workspace.icon_emoji,
            icon_url=workspace.icon_url,
            is_active=bool(workspace.is_active),
            created_by_user_id=actor_user_id,
        )

    async def get_primary_runtime(
        self,
        *,
        project_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ProjectRuntimeRecord | None:
        return await ProjectRuntimeRecord.get_or_none(
            project_id=project_id,
            kind=ProjectRuntimeKind.PRIMARY,
            using_db=conn,
        )

    async def get_runtime_by_id(self, *, runtime_id: UUID) -> ProjectRuntimeRecord:
        runtime = await ProjectRuntimeRecord.get_or_none(id=runtime_id)
        if runtime is None:
            raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
        return runtime

    async def get_runtime_site(self, *, runtime_id: UUID) -> SiteRecord | None:
        await self.get_runtime_by_id(runtime_id=runtime_id)
        return await SiteRecord.get_or_none(runtime_id=runtime_id)

    async def get_primary_project_ids_by_workspace_ids(
        self,
        *,
        workspace_ids: list[UUID],
    ) -> dict[UUID, UUID]:
        if not workspace_ids:
            return {}

        rows = (
            await ProjectRecord
            .filter(workspace_id__in=workspace_ids, is_active=True)
            .order_by("workspace_id", "created_at", "id")
            .values("id", "workspace_id")
        )

        project_ids_by_workspace: dict[UUID, UUID] = {}
        for row in rows:
            workspace_id = UUID(str(row["workspace_id"]))
            if workspace_id in project_ids_by_workspace:
                continue
            project_ids_by_workspace[workspace_id] = UUID(str(row["id"]))
        return project_ids_by_workspace
