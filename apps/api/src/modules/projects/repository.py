from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.expressions import Q

from src.common.repositories.base import BaseRepository
from src.common.utils.slug import slugify
from src.core.exceptions import Conflict, NotFound
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.projects.membership import ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeKind, ProjectRuntimeRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.workspaces.slug.service import parse_explicit_workspace_slug


class ProjectRepository(BaseRepository):
    async def list_projects(
        self,
        *,
        workspace_id: UUID | None = None,
        user_id: UUID | None = None,
        q: str | None = None,
        is_active: bool | None = True,
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
        return await qs.order_by("created_at", "id").all()

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
    ) -> bool:
        qs = ProjectRecord.filter(workspace_id=workspace_id, slug=slug)
        if exclude_project_id is not None:
            qs = qs.exclude(id=exclude_project_id)
        return await qs.exists()

    async def _next_available_slug(self, *, workspace_id: UUID, name: str) -> str:
        base_slug = slugify(name)[:64] or "project"
        slug = base_slug
        suffix = 2
        while await self.slug_exists(workspace_id=workspace_id, slug=slug):
            suffix_text = f"-{suffix}"
            slug = f"{base_slug[: max(1, 64 - len(suffix_text))]}{suffix_text}"
            suffix += 1
        return slug

    async def check_slug_availability(
        self,
        *,
        workspace_id: UUID,
        slug: str,
        exclude_project_id: UUID | None = None,
    ) -> tuple[str | None, str | None]:
        normalized_slug, err = parse_explicit_workspace_slug(slug)
        if err == "invalid" or normalized_slug is None:
            return None, "invalid"
        if err == "reserved":
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
    ) -> ProjectRecord:
        resolved_slug = slug or await self._next_available_slug(workspace_id=workspace_id, name=name)
        if await self.slug_exists(workspace_id=workspace_id, slug=resolved_slug):
            raise Conflict("Project slug already exists", error="PROJECT_SLUG_EXISTS")

        return await ProjectRecord.create(
            workspace_id=workspace_id,
            slug=resolved_slug,
            name=name[:128],
            description=description,
            is_active=True,
            created_by_user_id=actor_user_id,
        )

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
    ) -> ProjectRecord:
        project = await self.get_project_by_id(project_id=project_id)
        update_fields: list[str] = []

        if name is not None:
            project.name = name[:128]
            update_fields.append("name")

        if slug is not None:
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
            await project.save(update_fields=[*dict.fromkeys([*update_fields, "updated_at"])])
        return await self.get_project_by_id(project_id=project_id)

    async def set_project_active(self, *, project_id: UUID, is_active: bool) -> ProjectRecord:
        project = await self.get_project_by_id(project_id=project_id)
        if bool(project.is_active) != is_active:
            project.is_active = is_active
            await project.save(update_fields=["is_active", "updated_at"])
        return await self.get_project_by_id(project_id=project_id)

    async def count_active_projects_in_workspace(
        self,
        *,
        workspace_id: UUID,
        exclude_project_id: UUID | None = None,
    ) -> int:
        qs = ProjectRecord.filter(workspace_id=workspace_id, is_active=True)
        if exclude_project_id is not None:
            qs = qs.exclude(id=exclude_project_id)
        return int(await qs.count())

    async def delete_project(self, *, project_id: UUID) -> bool:
        project = await self.get_project_by_id(project_id=project_id)
        deleted_count = await project.delete()
        return int(deleted_count or 0) > 0

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
            slug=(workspace.slug or "project")[:64],
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

    async def get_primary_runtime(self, *, project_id: UUID) -> ProjectRuntimeRecord | None:
        return await ProjectRuntimeRecord.get_or_none(project_id=project_id, kind=ProjectRuntimeKind.PRIMARY)

    async def get_runtime_by_id(self, *, runtime_id: UUID) -> ProjectRuntimeRecord:
        runtime = await ProjectRuntimeRecord.get_or_none(id=runtime_id)
        if runtime is None:
            raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
        return runtime

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
