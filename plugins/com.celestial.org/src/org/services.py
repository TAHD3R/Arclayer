from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.expressions import Q

from apps.api.common.services import BaseService
from apps.api.common.utils.ids import uuid7
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.core.i18n import t
from apps.api.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.models.user import User
from org.repository import OrgRepository
from org.schema import DepartmentOut, PositionOut, UserDepartmentOut, UserPositionOut


def _tr(key: str, default: str) -> str:
    return t("org", key, default=default)


class OrgService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrgRepository()

    async def list_departments(self):
        return await self.repo.list_departments()

    async def list_departments_paginated(self, *, params: PageParams) -> PageData[DepartmentOut]:
        qs = self.repo.query_departments()
        return await paginate_queryset(qs, params=params, out_schema=DepartmentOut)

    async def create_department(self, payload: dict[str, Any]):
        code = payload.get("code")
        if code:
            existing = await self.repo.get_department_by_code(str(code))
            if existing is not None:
                raise Conflict(message=_tr("DEPARTMENT_CODE_EXISTS", "部门编码已存在"), error="DEPARTMENT_CODE_EXISTS")
        parent_id = payload.get("parent_id")
        parent = None
        if parent_id:
            parent = await self.repo.get_department(UUID(str(parent_id)))
            if parent is None:
                raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")

        department_id = uuid7()
        parent_path = f"/{parent.id}" if parent and not parent.path else (parent.path if parent else "")
        depth = int(parent.depth) + 1 if parent else 0
        path = f"{parent_path}/{department_id}" if parent_path else f"/{department_id}"

        return await self.repo.create_department(
            department_id=department_id,
            code=code,
            name=str(payload["name"]),
            parent_id=parent_id,
            path=path,
            depth=depth,
            sort=int(payload.get("sort", 0)),
            is_active=bool(payload.get("is_active", True)),
            description=payload.get("description"),
        )

    async def update_department(self, *, department_id: UUID, payload: dict[str, Any]):
        department = await self.repo.get_department(department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")

        updates: dict[str, Any] = {}
        if "name" in payload and payload["name"] is not None:
            updates["name"] = payload["name"]
        if "sort" in payload and payload["sort"] is not None:
            updates["sort"] = payload["sort"]
        if "is_active" in payload and payload["is_active"] is not None:
            updates["is_active"] = payload["is_active"]
        if "description" in payload:
            updates["description"] = payload.get("description")
        if "parent_id" in payload:
            parent_id = payload.get("parent_id")
            if parent_id == department_id:
                raise BadRequest(message=_tr("INVALID_PARENT", "父部门不合法"), error="INVALID_PARENT")
            await self._apply_department_parent_change(
                department, new_parent_id=UUID(str(parent_id)) if parent_id else None
            )

        if updates:
            department = await self.repo.update_department(department, updates=updates)
        return department

    async def delete_department(self, *, department_id: UUID) -> None:
        department = await self.repo.get_department(department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
        if await self.repo.department_has_children(department_id):
            raise BadRequest(
                message=_tr("DEPARTMENT_HAS_CHILDREN", "部门下存在子部门，无法删除"),
                error="DEPARTMENT_HAS_CHILDREN",
            )
        if await self.repo.department_has_users(department_id):
            raise BadRequest(
                message=_tr("DEPARTMENT_HAS_USERS", "部门下存在用户，无法删除"),
                error="DEPARTMENT_HAS_USERS",
            )
        await self.repo.soft_delete_department(department)

    async def restore_department(self, *, department_id: UUID):
        # Restore is only allowed when parent is not deleted, to avoid creating hidden orphans.
        from org.models import Department

        department = await Department.get_or_none(id=department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
        if department.deleted_at is None:
            return department

        if department.parent_id:
            parent = await self.repo.get_department(department.parent_id)
            if parent is None:
                raise BadRequest(
                    message=_tr("DEPARTMENT_PARENT_DELETED", "父部门已删除，无法恢复"),
                    error="DEPARTMENT_PARENT_DELETED",
                )

        department = await self.repo.restore_department(department)
        # Ensure path/depth are valid (restore may happen after directory fields were rebuilt).
        await self.ensure_department_directory()
        return department

    async def ensure_department_directory(self) -> None:
        """
        Best-effort repair for directory fields (path/depth).

        - This is intentionally lightweight: only runs when missing values are detected.
        - For heavy operations (validate/repair/move/merge), we will provide org.tools plugin later.
        """

        from org.models import Department

        missing = (
            await Department
            .filter(deleted_at__isnull=True)
            .filter(Q(path__isnull=True) | Q(path="") | Q(depth__isnull=True))
            .exists()
        )
        if not missing:
            return
        await self.rebuild_department_directory()

    async def rebuild_department_directory(self) -> None:
        """
        Rebuild path/depth for all non-deleted departments.

        This is the core "directoryization" mechanic. It is safe for small/medium org trees,
        and provides a correctness baseline even before org.tools is introduced.
        """

        from org.models import Department

        rows = await Department.filter(deleted_at__isnull=True).all()
        by_id: dict[UUID, Department] = {row.id: row for row in rows}
        children: dict[UUID | None, list[Department]] = {}
        for row in rows:
            children.setdefault(row.parent_id, []).append(row)

        # Stable output: respect sort/name when rebuilding, so tree is deterministic.
        for items in children.values():
            items.sort(key=lambda d: (d.sort, d.name, str(d.id)))

        roots: list[Department] = []
        for row in rows:
            if row.parent_id is None or row.parent_id not in by_id:
                roots.append(row)
        roots.sort(key=lambda d: (d.sort, d.name, str(d.id)))

        visited: set[UUID] = set()

        async def _walk(node: Department, *, parent_path: str | None, depth: int) -> None:
            if node.id in visited:
                return
            visited.add(node.id)
            path = f"{parent_path}/{node.id}" if parent_path else f"/{node.id}"
            updates: dict[str, Any] = {}
            if node.path != path:
                updates["path"] = path
            if node.depth != depth:
                updates["depth"] = depth
            if updates:
                for k, v in updates.items():
                    setattr(node, k, v)
                await node.save(update_fields=list(updates.keys()))

            for child in children.get(node.id, []):
                await _walk(child, parent_path=path, depth=depth + 1)

        for root in roots:
            await _walk(root, parent_path=None, depth=0)

    async def _apply_department_parent_change(self, department, *, new_parent_id: UUID | None) -> None:
        """
        Apply parent_id change while keeping directory fields (path/depth) consistent.

        This is the minimal "move department" support inside core CRUD.
        More advanced operations (audit, merge, dry-run) will live in org.tools plugin.
        """

        from org.models import Department

        current_parent_id = department.parent_id
        if new_parent_id == current_parent_id:
            return

        new_parent = None
        if new_parent_id is not None:
            new_parent = await self.repo.get_department(new_parent_id)
            if new_parent is None:
                raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
            # Prevent cycles: cannot move a node under its own subtree.
            if await self._department_is_descendant(candidate=new_parent, ancestor=department):
                raise BadRequest(
                    message=_tr("DEPARTMENT_MOVE_CYCLE", "不允许移动到子部门下"), error="DEPARTMENT_MOVE_CYCLE"
                )

        old_path = department.path or f"/{department.id}"
        old_depth = int(department.depth or 0)
        if new_parent is None:
            new_path = f"/{department.id}"
            new_depth = 0
        else:
            parent_path = new_parent.path or f"/{new_parent.id}"
            new_path = f"{parent_path}/{department.id}"
            new_depth = int(new_parent.depth or 0) + 1
        depth_delta = new_depth - old_depth

        # Update self first.
        department.parent_id = new_parent_id
        department.path = new_path
        department.depth = new_depth
        await department.save(update_fields=["parent_id", "path", "depth"])

        # Update descendants (materialized path rewrite).
        prefix = f"{old_path}/"
        descendants = await Department.filter(deleted_at__isnull=True, path__startswith=prefix).all()
        for row in descendants:
            if not row.path:
                continue
            suffix = row.path[len(old_path) :]
            row.path = f"{new_path}{suffix}"
            row.depth = int(row.depth or 0) + depth_delta
            await row.save(update_fields=["path", "depth"])

    async def _department_is_descendant(self, *, candidate, ancestor) -> bool:
        """
        Return True if candidate is within ancestor's subtree (including self).

        We prefer path-based check when possible; fall back to parent-chain walk when needed.
        """

        if candidate.id == ancestor.id:
            return True

        if candidate.path and ancestor.path:
            return candidate.path.startswith(f"{ancestor.path}/")

        # Fallback: walk parent chain.
        from org.models import Department

        current_id = candidate.parent_id
        seen: set[UUID] = set()
        while current_id is not None:
            if current_id == ancestor.id:
                return True
            if current_id in seen:
                # Cycle detected; fail closed.
                return True
            seen.add(current_id)
            current = await Department.get_or_none(id=current_id)
            if current is None:
                return False
            current_id = current.parent_id

    async def list_positions(self):
        return await self.repo.list_positions()

    async def list_positions_paginated(self, *, params: PageParams) -> PageData[PositionOut]:
        qs = self.repo.query_positions()
        return await paginate_queryset(qs, params=params, out_schema=PositionOut)

    async def create_position(self, payload: dict[str, Any]):
        existing = await self.repo.get_position_by_code(str(payload["code"]))
        if existing is not None:
            raise Conflict(message=_tr("POSITION_CODE_EXISTS", "岗位编码已存在"), error="POSITION_CODE_EXISTS")
        return await self.repo.create_position(
            code=str(payload["code"]),
            name=str(payload["name"]),
            sort=int(payload.get("sort", 0)),
            is_active=bool(payload.get("is_active", True)),
            description=payload.get("description"),
        )

    async def update_position(self, *, position_id: UUID, payload: dict[str, Any]):
        position = await self.repo.get_position(position_id)
        if position is None:
            raise NotFound(message=_tr("POSITION_NOT_FOUND", "岗位不存在"), error="POSITION_NOT_FOUND")

        updates: dict[str, Any] = {}
        if "name" in payload and payload["name"] is not None:
            updates["name"] = payload["name"]
        if "sort" in payload and payload["sort"] is not None:
            updates["sort"] = payload["sort"]
        if "is_active" in payload and payload["is_active"] is not None:
            updates["is_active"] = payload["is_active"]
        if "description" in payload:
            updates["description"] = payload.get("description")

        return await self.repo.update_position(position, updates=updates)

    async def delete_position(self, *, position_id: UUID) -> None:
        position = await self.repo.get_position(position_id)
        if position is None:
            raise NotFound(message=_tr("POSITION_NOT_FOUND", "岗位不存在"), error="POSITION_NOT_FOUND")
        await self.repo.delete_position(position_id)

    async def list_user_departments(self, *, user_id: UUID):
        await self._ensure_user(user_id)
        return await self.repo.list_user_departments(user_id=user_id)

    async def list_user_departments_paginated(
        self, *, user_id: UUID, params: PageParams
    ) -> PageData[UserDepartmentOut]:
        await self._ensure_user(user_id)
        qs = self.repo.query_user_departments(user_id=user_id)
        return await paginate_queryset(qs, params=params, out_schema=UserDepartmentOut)

    async def assign_user_department(self, *, user_id: UUID, department_id: UUID, primary: bool = False) -> None:
        await self._ensure_user(user_id)
        department = await self.repo.get_department(department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
        await self.repo.ensure_user_department(user_id=user_id, department_id=department_id)
        if primary:
            await self.repo.set_primary_department(user_id=user_id, department_id=department_id)
        else:
            # If this is the first department for the user, auto set primary.
            items = await self.repo.list_user_departments(user_id=user_id)
            if items and not any(item.is_primary for item in items):
                await self.repo.set_primary_department(user_id=user_id, department_id=items[0].department_id)

    async def revoke_user_department(self, *, user_id: UUID, department_id: UUID) -> None:
        await self._ensure_user(user_id)
        await self.repo.remove_user_department(user_id=user_id, department_id=department_id)
        items = await self.repo.list_user_departments(user_id=user_id)
        if items and not any(item.is_primary for item in items):
            await self.repo.set_primary_department(user_id=user_id, department_id=items[0].department_id)

    async def set_primary_department(self, *, user_id: UUID, department_id: UUID) -> None:
        await self._ensure_user(user_id)
        department = await self.repo.get_department(department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
        items = await self.repo.list_user_departments(user_id=user_id)
        if not any(item.department_id == department_id for item in items):
            raise BadRequest(
                message=_tr("USER_DEPARTMENT_MISSING", "用户不在该部门中"),
                error="USER_DEPARTMENT_MISSING",
            )
        await self.repo.set_primary_department(user_id=user_id, department_id=department_id)

    async def list_user_positions(self, *, user_id: UUID):
        await self._ensure_user(user_id)
        return await self.repo.list_user_positions(user_id=user_id)

    async def list_user_positions_paginated(self, *, user_id: UUID, params: PageParams) -> PageData[UserPositionOut]:
        await self._ensure_user(user_id)
        qs = self.repo.query_user_positions(user_id=user_id)
        return await paginate_queryset(qs, params=params, out_schema=UserPositionOut)

    async def assign_user_position(self, *, user_id: UUID, position_id: UUID) -> None:
        await self._ensure_user(user_id)
        position = await self.repo.get_position(position_id)
        if position is None:
            raise NotFound(message=_tr("POSITION_NOT_FOUND", "岗位不存在"), error="POSITION_NOT_FOUND")
        await self.repo.ensure_user_position(user_id=user_id, position_id=position_id)

    async def revoke_user_position(self, *, user_id: UUID, position_id: UUID) -> None:
        await self._ensure_user(user_id)
        await self.repo.remove_user_position(user_id=user_id, position_id=position_id)

    async def _ensure_user(self, user_id: UUID) -> User:
        user = await User.get_or_none(id=user_id)
        if user is None:
            raise NotFound(message=_tr("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")
        return user
