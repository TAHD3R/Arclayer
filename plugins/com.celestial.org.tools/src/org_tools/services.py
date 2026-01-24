from __future__ import annotations

from uuid import UUID

from org.models import Department, UserDepartment
from org.services import OrgService
from tortoise.expressions import Q

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound
from apps.api.core.i18n import t
from org_tools.repository import OrgToolsRepository
from org_tools.schema import (
    DepartmentMergeRequest,
    DepartmentMoveRequest,
    DepartmentReorderRequest,
    OrgRepairResult,
    OrgValidateReport,
)


def _tr(key: str, default: str) -> str:
    return t("org_tools", key, default=default)


class OrgToolsService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrgToolsRepository()
        self.org = OrgService(settings)

    async def validate(self) -> OrgValidateReport:
        deps = await Department.filter(deleted_at__isnull=True).all()
        by_id: dict[UUID, Department] = {d.id: d for d in deps}
        orphans: list[UUID] = []
        missing_dir: list[UUID] = []
        for d in deps:
            if d.parent_id is not None and d.parent_id not in by_id:
                orphans.append(d.id)
            if not d.path or d.depth is None:
                missing_dir.append(d.id)

        # Cycle detection via parent chain (O(n * depth)), acceptable for early-stage org sizes.
        cycles: list[list[UUID]] = []
        for d in deps:
            chain: list[UUID] = []
            seen: set[UUID] = set()
            current = d
            while current.parent_id is not None:
                if current.id in seen:
                    chain.append(current.id)
                    cycles.append(chain)
                    break
                seen.add(current.id)
                chain.append(current.id)
                parent = by_id.get(current.parent_id)
                if parent is None:
                    break
                current = parent

        # Primary department validation.
        users_without_primary: list[UUID] = []
        users_multi_primary: list[UUID] = []

        user_ids = await UserDepartment.all().values_list("user_id", flat=True)
        for uid in set(user_ids):
            primary_count = await UserDepartment.filter(user_id=uid, is_primary=True).count()
            if primary_count == 0:
                users_without_primary.append(uid)
            elif primary_count > 1:
                users_multi_primary.append(uid)

        return OrgValidateReport(
            departments_total=len(deps),
            cycles=cycles,
            orphans=sorted(orphans),
            missing_directory_fields=sorted(missing_dir),
            users_without_primary_department=sorted(users_without_primary),
            users_with_multiple_primary_departments=sorted(users_multi_primary),
        )

    async def repair_directory(self, *, actor_user_id: UUID | None) -> OrgRepairResult:
        # Rebuild department path/depth.
        before_missing = (
            await Department.filter(deleted_at__isnull=True).filter(Q(path__isnull=True) | Q(path="")).count()
        )
        await self.org.rebuild_department_directory()
        after_missing = (
            await Department.filter(deleted_at__isnull=True).filter(Q(path__isnull=True) | Q(path="")).count()
        )
        repaired = max(before_missing - after_missing, 0)

        await self.repo.log_change(
            actor_user_id=actor_user_id,
            action="org.repair.directory",
            entity_type="department",
            entity_id=None,
            payload={"repaired_departments": repaired},
        )
        return OrgRepairResult(repaired_departments=repaired, repaired_users=0)

    async def repair_primary_departments(self, *, actor_user_id: UUID | None) -> OrgRepairResult:
        affected_users: set[UUID] = set()
        user_ids = await UserDepartment.all().values_list("user_id", flat=True)
        for uid in set(user_ids):
            rows = await UserDepartment.filter(user_id=uid).all().order_by("-is_primary", "created_at")
            if not rows:
                continue
            primaries = [r for r in rows if r.is_primary]
            if len(primaries) == 1:
                continue
            affected_users.add(uid)
            # Keep the first row as primary; clear others.
            keep = rows[0]
            await UserDepartment.filter(user_id=uid).update(is_primary=False)
            await UserDepartment.filter(id=keep.id).update(is_primary=True)

        await self.repo.log_change(
            actor_user_id=actor_user_id,
            action="org.repair.primary_department",
            entity_type="user",
            entity_id=None,
            payload={"affected_users": len(affected_users)},
        )
        return OrgRepairResult(repaired_departments=0, repaired_users=len(affected_users))

    async def move_department(
        self, *, department_id: UUID, payload: DepartmentMoveRequest, actor_user_id: UUID | None
    ) -> None:
        department = await Department.filter(id=department_id, deleted_at__isnull=True).first()
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")

        await self.org.update_department(department_id=department_id, payload={"parent_id": payload.new_parent_id})
        await self.repo.log_change(
            actor_user_id=actor_user_id,
            action="org.department.move",
            entity_type="department",
            entity_id=department_id,
            payload={"new_parent_id": str(payload.new_parent_id) if payload.new_parent_id else None},
        )

    async def reorder_departments(
        self,
        *,
        payload: DepartmentReorderRequest,
        actor_user_id: UUID | None,
    ) -> None:
        # Ensure all departments exist and share the same parent_id.
        rows = await Department.filter(id__in=payload.ordered_ids, deleted_at__isnull=True).all()
        found = {d.id for d in rows}
        missing = [str(did) for did in payload.ordered_ids if did not in found]
        if missing:
            raise NotFound(
                message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"),
                error="DEPARTMENT_NOT_FOUND",
                details={"missing": missing},
            )

        parent_ids = {d.parent_id for d in rows}
        if len(parent_ids) != 1 or next(iter(parent_ids)) != payload.parent_id:
            raise BadRequest(message=_tr("INVALID_OPERATION", "非法操作"), error="INVALID_OPERATION")

        # Apply sort = index * 10 to allow future insertions without full re-order.
        for idx, did in enumerate(payload.ordered_ids):
            await Department.filter(id=did).update(sort=idx * 10)

        await self.repo.log_change(
            actor_user_id=actor_user_id,
            action="org.department.reorder",
            entity_type="department",
            entity_id=payload.parent_id,
            payload={
                "parent_id": str(payload.parent_id) if payload.parent_id else None,
                "count": len(payload.ordered_ids),
            },
        )

    async def merge_departments(
        self,
        *,
        source_department_id: UUID,
        payload: DepartmentMergeRequest,
        actor_user_id: UUID | None,
    ) -> None:
        if source_department_id == payload.target_department_id:
            raise BadRequest(message=_tr("INVALID_OPERATION", "非法操作"), error="INVALID_OPERATION")

        source = await Department.filter(id=source_department_id, deleted_at__isnull=True).first()
        if source is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")

        target = await Department.filter(id=payload.target_department_id, deleted_at__isnull=True).first()
        if target is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")

        # Move children under target (default).
        if payload.move_children_to_target:
            children = await Department.filter(parent_id=source_department_id, deleted_at__isnull=True).all()
            for child in children:
                await self.org.update_department(department_id=child.id, payload={"parent_id": target.id})

        # Migrate user bindings and remove source bindings (otherwise source can't be deleted).
        migrated_users = 0
        if payload.migrate_users:
            rows = await UserDepartment.filter(department_id=source_department_id).all()
            for row in rows:
                # Ensure user binding on target exists.
                await UserDepartment.get_or_create(user_id=row.user_id, department_id=target.id)
                migrated_users += 1
            # Remove old bindings from source.
            await UserDepartment.filter(department_id=source_department_id).delete()
            # Repair primary departments after migration.
            await self.repair_primary_departments(actor_user_id=actor_user_id)

        # Optional: migrate department role bindings (requires com.celestial.rbac.org).
        migrated_roles = 0
        if payload.migrate_roles:
            try:
                from rbac_org.models import DepartmentRole
            except Exception:
                DepartmentRole = None  # type: ignore[assignment]
            if DepartmentRole is not None:
                links = await DepartmentRole.filter(department_id=source_department_id).all()
                for link in links:
                    _, created = await DepartmentRole.get_or_create(department_id=target.id, role_id=link.role_id)
                    if created:
                        migrated_roles += 1
                await DepartmentRole.filter(department_id=source_department_id).delete()

        # Finally soft-delete the source department.
        await self.org.delete_department(department_id=source_department_id)

        await self.repo.log_change(
            actor_user_id=actor_user_id,
            action="org.department.merge",
            entity_type="department",
            entity_id=source_department_id,
            payload={
                "target_department_id": str(target.id),
                "move_children_to_target": payload.move_children_to_target,
                "migrate_users": payload.migrate_users,
                "migrated_users": migrated_users,
                "migrate_roles": payload.migrate_roles,
                "migrated_roles": migrated_roles,
            },
        )
