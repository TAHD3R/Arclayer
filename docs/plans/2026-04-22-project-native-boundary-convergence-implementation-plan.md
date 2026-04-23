# Project-Native Boundary Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收敛 project 原生边界，建立 project-native authz、project-native action catalog、project-native core settings schema/service，并同步 OpenAPI 与 admin 合同。

**Architecture:** 本次改造以 `ProjectRequestContext` 为 project 域的唯一请求上下文，在 `apps/api/src/modules/projects/` 下新增 authz、permissions、settings 三个 project-native 模块，统一吸收当前散落在 governance/router helpers/workspace projection 里的边界逻辑。路由路径保持稳定，返回合同升级为 project 语义，底层 permission code 继续复用 canonical `system:*` 授权键，从而让 RBAC 主目录、项目治理接口、Admin 消费层保持同一条授权链。

**Tech Stack:** FastAPI, Pydantic v2, Tortoise ORM, pnpm workspace, OpenAPI codegen, React, TanStack Query, Vitest

**Execution Status (2026-04-22, updated 2026-04-24):** Task 1 到 Task 7 的首轮 project-native convergence 已落地。其后续 hard-cut 已把 project settings 的存储、权限判定和 service 调用链收拢到 `project_id` 维度。`pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_authz_contract_unit.py tests/modules/projects/test_project_governance_routes_contract_unit.py tests/modules/projects/test_project_governance_actions_unit.py tests/modules/projects/test_project_settings_service_unit.py tests/modules/projects/test_project_api_key_scopes_unit.py`、`RUN_INTEGRATION_TESTS=1 ... tests/modules/projects/test_project_settings_core_integration.py`、`pnpm -C apps/admin typecheck` 和 project settings / content project surfaces 的 focused Admin tests 已通过。此前残留的 `ProjectAuthzSnapshot.workspaceId` consumer gap 已在当前工作树收口。

---

## File Structure

### New Files

- `apps/api/src/modules/projects/authz/schema.py`
- `apps/api/src/modules/projects/authz/service.py`
- `apps/api/src/modules/projects/authz/router_helpers.py`
- `apps/api/src/modules/projects/permissions/catalog.py`
- `apps/api/src/modules/projects/permissions/service.py`
- `apps/api/src/modules/projects/governance/schema.py`
- `apps/api/src/modules/projects/settings/schema.py`
- `apps/api/src/modules/projects/settings/service.py`
- `apps/api/src/modules/projects/settings/events.py`
- `apps/api/tests/modules/projects/test_project_authz_contract_unit.py`
- `apps/api/tests/modules/projects/test_project_governance_routes_contract_unit.py`
- `apps/api/tests/modules/projects/test_project_governance_actions_unit.py`
- `apps/api/tests/modules/projects/test_project_settings_service_unit.py`
- `apps/api/tests/modules/projects/test_project_core_settings_contract_unit.py`
- `apps/admin/test/api/project-governance-contract.test.ts`
- `apps/admin/test/api/project-core-settings-contract.test.ts`

### Modified Files

- `apps/api/src/modules/projects/router.py`
- `apps/api/src/modules/projects/governance/router.py`
- `apps/api/src/modules/projects/automation/router.py`
- `apps/api/src/modules/projects/http/router_helpers.py`
- `apps/api/src/modules/projects/http/service.py`
- `apps/api/src/modules/projects/api_keys/scopes.py`
- `apps/api/src/modules/projects/api_keys/events.py`
- `apps/api/src/modules/workspaces/http/service.py`
- `apps/api/src/modules/workspaces/rbac/schema.py`
- `apps/api/src/modules/workspaces/permissions/__init__.py`
- `apps/api/src/modules/workspaces/permissions/registry.py`
- `apps/api/tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py`
- `apps/api/tests/modules/workspaces/test_workspace_permission_policy_service_unit.py`
- `apps/admin/src/api/workspaces.ts`
- `apps/admin/src/api/rbac.ts`
- `apps/admin/src/api/settings.ts`
- `apps/admin/src/hooks/use-workspace-permission-access.ts`
- `apps/admin/src/types/api/rbac.ts`
- `apps/admin/src/types/api/index.ts`
- `apps/admin/src/pages/projects/settings/site/components/general-settings-shell.tsx`
- `apps/admin/src/pages/projects/content/library/article-editor/hooks/use-content-library-article-editor.ts`
- `apps/admin/test/pages/settings/general-settings-shell-permissions.test.tsx`
- `apps/admin/test/pages/settings/context-settings-pages.test.tsx`
- `apps/admin/test/pages/workspaces/content/content-library-page.test.tsx`
- `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- `apps/admin/test/pages/workspaces/content/content-models-control-center.test.tsx`
- `apps/admin/test/pages/workspaces/content/content-automation-page.test.tsx`
- `apps/admin/test/pages/workspaces/content/content-release-center-page.test.tsx`
- `apps/admin/test/pages/workspaces/content/content-site-builder-shell.test.tsx`
- `packages/openapi/src/generated/types.gen.ts`
- `packages/openapi/src/generated/sdk.gen.ts`
- `packages/openapi/src/admin-types.ts`
- `packages/management-sdk/src/client.ts`

### Boundary Rules For This Plan

- `ProjectRequestContext` 继续承载 `project_id/workspace_id/organization_id/runtime_id` 与访问上下文。
- `ProjectAuthzSnapshot` 当前只输出 `projectId/userId/scope/roleCodes/permissionCodes/isSuperuser`；asset/activity 一类 workspace-backed consumer 不能再从该合同读取 `workspaceId`。
- project action catalog 现在发布 project-scoped action code，权限判定基于 `ProjectMembership` 和 `ProjectMemberRole`。
- project core settings 路径继续保持 `/projects/{project_id}/settings/core`，读写类型为 project-native schema，持久化 scope 已切到 `SCOPE_TYPE_PROJECT`，`ProjectSettingsService` 签名也已去掉 `workspace_id`。

## Follow-Up Audit (2026-04-24)

Current audit conclusion:

- backend target goal 已闭合：project settings storage、authz、API key scopes、service signature 和 stale side effects 已收拢到 project 维度
- targeted API verification passed
- targeted Admin route/navigation verification passed
- targeted Admin consumer cleanup passed

Fresh evidence:

- `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_authz_contract_unit.py tests/modules/projects/test_project_governance_routes_contract_unit.py tests/modules/projects/test_project_governance_actions_unit.py tests/modules/projects/test_project_settings_service_unit.py tests/modules/projects/test_project_api_key_scopes_unit.py`
  - result: `22 passed`
- `timeout 120s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_settings_core_integration.py`
  - result: `1 passed`
- `pnpm -C apps/admin test test/pages/settings/context-settings-pages.test.tsx test/pages/account/projects-page.test.tsx test/lib/routing/notification-target.test.ts test/components/layout/favorite-nav-items.test.ts test/lib/workspace-nav-regression.test.ts`
  - result: `5 files passed, 19 tests passed`
- `pnpm -C apps/admin typecheck`
  - result: `exit 0`
- `pnpm -C apps/admin test test/api/project-governance-contract.test.ts test/pages/settings/general-settings-shell-permissions.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx test/pages/workspaces/content/content-automation-page.test.tsx test/pages/workspaces/content/content-release-center-page.test.tsx test/pages/workspaces/content/content-models-control-center.test.tsx`
  - result: `8 files passed, 65 tests passed`

Historical note:

- the long-form task body below still preserves earlier phase examples and checkpoints
- any example below that assumes `ProjectAuthzSnapshot.workspaceId` or project settings persisted on workspace scope is historical context, not the live contract

## Task 1: 建立 Project Authz 基础模块

**Files:**
- Create: `apps/api/src/modules/projects/authz/schema.py`
- Create: `apps/api/src/modules/projects/authz/service.py`
- Create: `apps/api/src/modules/projects/authz/router_helpers.py`
- Modify: `apps/api/src/modules/projects/http/service.py`
- Modify: `apps/api/src/modules/workspaces/http/service.py`
- Test: `apps/api/tests/modules/projects/test_project_authz_contract_unit.py`

- [x] **Step 1: 写 project authz 合同单测**

```python
from src.modules.projects.authz.schema import ProjectAuthzSnapshot, ProjectPermissionActionOut


def test_project_authz_snapshot_carries_project_scope_fields() -> None:
    snapshot = ProjectAuthzSnapshot(
        project_id="00000000-0000-0000-0000-000000000001",
        workspace_id="00000000-0000-0000-0000-000000000002",
        user_id="00000000-0000-0000-0000-000000000003",
        scope="project",
        role_codes=["owner"],
        permission_codes=["system:site:manage"],
        is_superuser=False,
    )

    assert snapshot.scope == "project"
    assert snapshot.project_id
    assert snapshot.workspace_id
    assert snapshot.permission_codes == ["system:site:manage"]


def test_project_permission_action_out_uses_project_shape() -> None:
    item = ProjectPermissionActionOut(
        code="site:manage",
        description="Manage project site runtime settings.",
        subject_kinds=["workspace_member", "personal_api_key"],
        permission_codes=["system:site:manage"],
    )

    assert item.code == "site:manage"
    assert item.permission_codes == ["system:site:manage"]
```

- [x] **Step 2: 运行单测确认 contract 先失败**

Run: `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_authz_contract_unit.py`

Expected: `ModuleNotFoundError` 或 `ImportError` 指向 `src.modules.projects.authz`

- [x] **Step 3: 新增 project authz schema 与 service**

```python
# apps/api/src/modules/projects/authz/schema.py
from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseSchema


class ProjectAuthzSnapshot(BaseSchema):
    project_id: UUID = Field(..., description="Project id.")
    workspace_id: UUID = Field(..., description="Backing workspace id.")
    user_id: UUID = Field(..., description="Current user id.")
    scope: Literal["project"] = Field(default="project", description="Authz scope.")
    role_codes: list[str] = Field(default_factory=list, description="Resolved role codes.")
    permission_codes: list[str] = Field(default_factory=list, description="Resolved permission codes.")
    is_superuser: bool = Field(default=False, description="Whether the actor has project superuser access.")


class ProjectPermissionActionOut(BaseSchema):
    code: str = Field(..., description="Canonical project action code.")
    description: str | None = Field(default=None, description="Action description.")
    subject_kinds: list[str] = Field(default_factory=list, description="Supported subject kinds.")
    permission_codes: list[str] = Field(default_factory=list, description="Backing permission codes.")
```

```python
# apps/api/src/modules/projects/authz/service.py
from __future__ import annotations

from uuid import UUID

from src.modules.projects.authz.schema import ProjectAuthzSnapshot
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.workspaces.authz.http.service import _build_workspace_authz_snapshot
from src.modules.workspaces.http.schema import WorkspaceContext


def project_context_to_workspace_context(ctx: ProjectRequestContext) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        workspace_kind=ctx.workspace_kind,
        access_type=ctx.access_type,
        org_membership_id=ctx.org_membership_id,
        is_org_owner=ctx.is_org_owner,
        workspace_membership_id=ctx.workspace_membership_id,
        visible_only=ctx.visible_only,
        is_creator_admin=ctx.is_creator_admin,
    )


async def get_project_authz_snapshot(*, ctx: ProjectRequestContext, user_id: UUID) -> ProjectAuthzSnapshot:
    workspace_snapshot = await _build_workspace_authz_snapshot(
        user_id=user_id,
        workspace_id=ctx.workspace_id,
    )
    return ProjectAuthzSnapshot(
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        user_id=user_id,
        role_codes=list(workspace_snapshot.role_codes),
        permission_codes=list(workspace_snapshot.permission_codes),
        is_superuser=workspace_snapshot.is_superuser,
    )
```

- [x] **Step 4: 暴露稳定的 workspace context resolver 并接入 router helpers**

```python
# apps/api/src/modules/workspaces/http/service.py
async def find_active_org_membership(*, organization_id: UUID, user_id: UUID):
    return await _find_active_org_membership(organization_id=organization_id, user_id=user_id)


async def require_active_workspace(*, workspace_id: UUID):
    return await _require_active_workspace(workspace_id=workspace_id)


async def resolve_member_workspace_context(*, workspace, organization_id: UUID, user_id: UUID, orgm):
    return await _resolve_member_workspace_context(
        workspace=workspace,
        organization_id=organization_id,
        user_id=user_id,
        orgm=orgm,
    )


async def resolve_guest_workspace_context(*, workspace, organization_id: UUID, user_id: UUID):
    return await _resolve_guest_workspace_context(
        workspace=workspace,
        organization_id=organization_id,
        user_id=user_id,
    )
```

```python
# apps/api/src/modules/projects/authz/router_helpers.py
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.authz.service import project_context_to_workspace_context
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted


async def ensure_project_permission_granted(
    permission: str,
    *,
    user_id: UUID,
    ctx: ProjectRequestContext,
    error_code: str = "PERMISSION_DENIED",
) -> None:
    await ensure_workspace_permission_granted(
        permission,
        user_id=user_id,
        ctx=project_context_to_workspace_context(ctx),
        error_code=error_code,
    )


def require_project_permission(permission: str, *, error_code: str = "PERMISSION_DENIED"):
    async def _dep(
        ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
        user_id: Annotated[UUID, Depends(get_current_user_id)],
    ) -> None:
        await ensure_project_permission_granted(permission, user_id=user_id, ctx=ctx, error_code=error_code)

    return Depends(_dep)
```

- [x] **Step 5: 运行 authz 单测确认通过**

Run: `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_authz_contract_unit.py`

Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add \
  apps/api/src/modules/projects/authz/schema.py \
  apps/api/src/modules/projects/authz/service.py \
  apps/api/src/modules/projects/authz/router_helpers.py \
  apps/api/src/modules/projects/http/service.py \
  apps/api/src/modules/workspaces/http/service.py \
  apps/api/tests/modules/projects/test_project_authz_contract_unit.py
git commit -m "feat(api): add project authz primitives"
```

## Task 2: 收敛 Project Router 与 Governance Authz 输出

**Files:**
- Modify: `apps/api/src/modules/projects/router.py`
- Modify: `apps/api/src/modules/projects/governance/router.py`
- Modify: `apps/api/src/modules/projects/automation/router.py`
- Modify: `apps/api/src/modules/projects/http/router_helpers.py`
- Modify: `apps/api/src/modules/projects/api_keys/scopes.py`
- Modify: `apps/api/src/modules/projects/api_keys/events.py`
- Test: `apps/api/tests/modules/projects/test_project_governance_routes_contract_unit.py`
- Test: `apps/api/tests/modules/projects/test_project_automation_router_contract_unit.py`

- [x] **Step 1: 写 project governance route 合同单测**

```python
async def test_project_me_authz_returns_project_scope_contract(client, seeded_project, owner_user):
    response = await client.get(f"/api/v1/projects/{seeded_project.public_id}/me/authz")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["scope"] == "project"
    assert data["projectId"] == seeded_project.public_id
    assert data["workspaceId"] == seeded_project.workspace_public_id
    assert "permissionCodes" in data


async def test_project_settings_core_requires_project_permission(client, seeded_project, viewer_user):
    response = await client.patch(
        f"/api/v1/projects/{seeded_project.public_id}/settings/core",
        json={"patch": {"site": {"name": "Viewer patch"}}},
    )

    assert response.status_code == 403
```

- [x] **Step 2: 运行 route 测试确认当前合同失败**

Run: `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_governance_routes_contract_unit.py tests/modules/projects/test_project_automation_router_contract_unit.py`

Expected: `/me/authz` 响应缺少 `scope/projectId/workspaceId`

- [x] **Step 3: 让 project routers 全部依赖 project authz helper**

```python
# apps/api/src/modules/projects/router.py
from src.modules.projects.authz.router_helpers import ensure_project_permission_granted
```

```python
# apps/api/src/modules/projects/governance/router.py
from src.modules.projects.authz.schema import ProjectAuthzSnapshot
from src.modules.projects.authz.service import get_project_authz_snapshot
from src.modules.projects.authz.router_helpers import ensure_project_permission_granted


@router.get("/me/authz", response_model=ResponseModel[ProjectAuthzSnapshot])
async def get_project_authz_snapshot_route(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
) -> ResponseModel[ProjectAuthzSnapshot]:
    snapshot = await get_project_authz_snapshot(ctx=ctx, user_id=user_id)
    return ApiResponse.success(data=snapshot)
```

```python
# apps/api/src/modules/projects/automation/router.py
from src.modules.projects.authz.router_helpers import require_project_permission
```

- [x] **Step 4: 同步 API key scope 与事件上下文**

```python
# apps/api/src/modules/projects/api_keys/scopes.py
from src.modules.projects.authz.schema import ProjectAuthzSnapshot


def resolve_personal_management_permissions(
    *,
    authz_snapshot: ProjectAuthzSnapshot,
    scopes: Iterable[str | ApiKeyScope],
) -> frozenset[str]:
    profile = build_api_key_access_profile(scopes)
    if authz_snapshot.is_superuser:
        return profile.management_permission_codes
    return frozenset(
        sorted(set(authz_snapshot.permission_codes) & set(profile.management_permission_codes))
    )
```

```python
# apps/api/src/modules/projects/api_keys/events.py
from src.modules.projects.authz.service import project_context_to_workspace_context
```

- [x] **Step 5: 运行路由与 automation 合同测试确认通过**

Run: `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_governance_routes_contract_unit.py tests/modules/projects/test_project_automation_router_contract_unit.py`

Expected: `passed`，并且 `/me/authz` 返回 project scope 字段

- [ ] **Step 6: Commit**

```bash
git add \
  apps/api/src/modules/projects/router.py \
  apps/api/src/modules/projects/governance/router.py \
  apps/api/src/modules/projects/automation/router.py \
  apps/api/src/modules/projects/http/router_helpers.py \
  apps/api/src/modules/projects/api_keys/scopes.py \
  apps/api/src/modules/projects/api_keys/events.py \
  apps/api/tests/modules/projects/test_project_governance_routes_contract_unit.py \
  apps/api/tests/modules/projects/test_project_automation_router_contract_unit.py
git commit -m "feat(api): converge project authz routes"
```

## Task 3: 引入 Project Action Catalog

**Files:**
- Create: `apps/api/src/modules/projects/permissions/catalog.py`
- Create: `apps/api/src/modules/projects/permissions/service.py`
- Create: `apps/api/src/modules/projects/governance/schema.py`
- Modify: `apps/api/src/modules/projects/governance/router.py`
- Test: `apps/api/tests/modules/projects/test_project_governance_actions_unit.py`

- [x] **Step 1: 写 project actions catalog 单测**

```python
from src.modules.projects.permissions.service import get_project_action_catalog


def test_project_action_catalog_exposes_project_surface_actions() -> None:
    registry = get_project_action_catalog()

    assert "site:manage" in registry
    assert registry["site:manage"].permission_codes == ("system:site:manage",)
    assert "content:routing:write" in registry
    assert registry["content:routing:write"].permission_codes == ("system:content:manage",)
    assert "delivery:graphql:read" in registry
    assert registry["delivery:graphql:read"].subject_kinds == ("delivery_api_key",)
```

- [x] **Step 2: 运行 catalog 单测确认失败**

Run: `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_governance_actions_unit.py`

Expected: `ImportError` 指向 `src.modules.projects.permissions`

- [x] **Step 3: 新增 project permissions catalog 与输出模型**

```python
# apps/api/src/modules/projects/permissions/catalog.py
from __future__ import annotations

from src.models.system.rbac import PermissionScope
from src.modules.workspaces.permissions.registry import PermissionActionDefinition


PROJECT_ACTION_DEFINITIONS: tuple[PermissionActionDefinition, ...] = (
    PermissionActionDefinition(
        code="content:items:write",
        description="Allow mutating project content items via management APIs.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="site:manage",
        description="Allow managing project site runtime settings.",
        permission_codes=("system:site:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:graphql:read",
        description="Allow querying project GraphQL delivery APIs.",
        permission_codes=(),
        subject_kinds=("delivery_api_key",),
        scope=PermissionScope.WORKSPACE.value,
    ),
)
```

```python
# apps/api/src/modules/projects/permissions/service.py
from __future__ import annotations

from functools import lru_cache

from src.modules.projects.permissions.catalog import PROJECT_ACTION_DEFINITIONS


@lru_cache(maxsize=1)
def get_project_action_catalog():
    return {item.code: item for item in PROJECT_ACTION_DEFINITIONS}
```

```python
# apps/api/src/modules/projects/governance/schema.py
from src.modules.projects.authz.schema import ProjectPermissionActionOut
```

- [x] **Step 4: 让 project `/actions` 仅返回 project catalog**

```python
# apps/api/src/modules/projects/governance/router.py
from src.modules.projects.governance.schema import ProjectPermissionActionOut
from src.modules.projects.permissions.service import get_project_action_catalog


@router.get("/actions", response_model=ResponseModel[list[ProjectPermissionActionOut]])
async def list_project_actions(
    _ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
) -> ResponseModel[list[ProjectPermissionActionOut]]:
    _ = user_id
    items = [
        ProjectPermissionActionOut(
            code=action,
            description=definition.description,
            subject_kinds=list(definition.subject_kinds),
            permission_codes=list(definition.permission_codes),
        )
        for action, definition in sorted(get_project_action_catalog().items(), key=lambda entry: entry[0])
    ]
    return ApiResponse.success(data=items)
```

- [x] **Step 5: 运行 catalog 与 workspace regression 测试**

Run: `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_governance_actions_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/workspaces/test_workspace_permission_policy_service_unit.py`

Expected: `passed`，workspace catalog 测试保持通过，project `/actions` 仅验证 project catalog

- [ ] **Step 6: Commit**

```bash
git add \
  apps/api/src/modules/projects/permissions/catalog.py \
  apps/api/src/modules/projects/permissions/service.py \
  apps/api/src/modules/projects/governance/schema.py \
  apps/api/src/modules/projects/governance/router.py \
  apps/api/tests/modules/projects/test_project_governance_actions_unit.py
git commit -m "feat(api): add project action catalog"
```

## Task 4: 引入 Project Core Settings Schema 和 Service

**Files:**
- Create: `apps/api/src/modules/projects/settings/schema.py`
- Create: `apps/api/src/modules/projects/settings/service.py`
- Create: `apps/api/src/modules/projects/settings/events.py`
- Modify: `apps/api/src/modules/projects/governance/router.py`
- Test: `apps/api/tests/modules/projects/test_project_settings_service_unit.py`
- Test: `apps/api/tests/modules/projects/test_project_core_settings_contract_unit.py`
- Test: `apps/api/tests/modules/workspaces/test_workspace_first_onboarding_state_integration.py`

- [x] **Step 1: 写 project settings service 单测**

```python
async def test_project_settings_service_masks_secrets_and_emits_project_event(settings, project_record):
    service = ProjectSettingsService(settings)

    detail = await service.patch_core(
        project_id=project_record.id,
        workspace_id=project_record.workspace_id,
        patch={"mail": {"provider": {"token": "secret-token"}}},
        updated_by=project_record.created_by_user_id,
    )

    assert detail.namespace == "core"
    assert detail.secrets == {"mail.provider.token": True}
```

```python
async def test_project_core_settings_route_reads_project_scope_contract(client, seeded_project):
    response = await client.get(f"/api/v1/projects/{seeded_project.public_id}/settings/core")

    assert response.status_code == 200
    assert response.json()["data"]["namespace"] == "core"
```

- [x] **Step 2: 运行 settings 测试确认先失败**

Run: `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_settings_service_unit.py tests/modules/projects/test_project_core_settings_contract_unit.py`

Expected: `ImportError` 或 route contract mismatch

- [x] **Step 3: 新增 project settings schema 与 events**

```python
# apps/api/src/modules/projects/settings/schema.py
from __future__ import annotations

from typing import Any

from pydantic import Field

from src.common.schemas import BaseSchema


class ProjectSettingsDetail(BaseSchema):
    namespace: str = Field(..., description="Settings namespace.")
    value: dict[str, Any] = Field(default_factory=dict, description="Project settings payload.")
    secrets: dict[str, bool] = Field(default_factory=dict, description="Masked secret paths.")
    updated_at: str | None = Field(default=None, description="Last update timestamp.")


class ProjectSettingsPatch(BaseSchema):
    patch: dict[str, Any] = Field(default_factory=dict, description="Deep merge patch payload.")
```

```python
# apps/api/src/modules/projects/settings/events.py
from __future__ import annotations

PROJECT_CORE_SETTINGS_UPDATED_EVENT = "settings.project.core.updated"


def build_project_settings_event_payload(*, project_id: str, workspace_id: str, paths: list[str]) -> dict[str, object]:
    return {
        "project_id": project_id,
        "workspace_id": workspace_id,
        "namespace": "core",
        "paths": paths,
    }
```

- [x] **Step 4: 新增 project settings service 并重接 governance router**

```python
# apps/api/src/modules/projects/settings/service.py
from __future__ import annotations

from typing import Any
from uuid import UUID

from src.models.settings import SettingRecord
from src.modules.projects.settings.events import (
    PROJECT_CORE_SETTINGS_UPDATED_EVENT,
    build_project_settings_event_payload,
)
from src.modules.projects.settings.schema import ProjectSettingsDetail
from src.modules.workspaces.settings.service import WorkspaceSettingsService
from src.modules.workspaces.settings.constants import CORE_SETTINGS_NAMESPACE
from src.modules.system.integrations.webhooks.service import WebhooksService


class ProjectSettingsService(WorkspaceSettingsService):
    async def get_core_detail(self, *, project_id: UUID, workspace_id: UUID) -> ProjectSettingsDetail:
        detail = await super().get_core_detail(workspace_id=workspace_id)
        return ProjectSettingsDetail(
            namespace=detail.namespace,
            value=detail.value,
            secrets=detail.secrets or {},
            updated_at=detail.updated_at.isoformat() if detail.updated_at else None,
        )

    async def patch_core(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        patch: dict[str, Any],
        updated_by: UUID | None,
    ) -> ProjectSettingsDetail:
        detail = await super().patch_core(workspace_id=workspace_id, patch=patch, updated_by=updated_by)
        WebhooksService(self.settings).emit_workspace_event_fire_and_forget(
            workspace_id=workspace_id,
            event=PROJECT_CORE_SETTINGS_UPDATED_EVENT,
            payload=build_project_settings_event_payload(
                project_id=str(project_id),
                workspace_id=str(workspace_id),
                paths=list(self._flatten_patch_paths(patch)),
            ),
        )
        return ProjectSettingsDetail(
            namespace=detail.namespace,
            value=detail.value,
            secrets=detail.secrets or {},
            updated_at=detail.updated_at.isoformat() if detail.updated_at else None,
        )
```

```python
# apps/api/src/modules/projects/governance/router.py
from src.modules.projects.settings.schema import ProjectSettingsDetail, ProjectSettingsPatch
from src.modules.projects.settings.service import ProjectSettingsService


@router.get("/settings/core", response_model=ResponseModel[ProjectSettingsDetail])
async def get_project_core_settings(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectSettingsService, Depends(get_project_settings_service)],
) -> ResponseModel[ProjectSettingsDetail]:
    await ensure_project_permission_granted("system:settings:read", user_id=user_id, ctx=ctx)
    detail = await service.get_core_detail(project_id=ctx.project_id, workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=detail)


@router.patch("/settings/core", response_model=ResponseModel[ProjectSettingsDetail])
async def patch_project_core_settings(
    payload: ProjectSettingsPatch,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectSettingsService, Depends(get_project_settings_service)],
) -> ResponseModel[ProjectSettingsDetail]:
    await ensure_project_permission_granted("system:settings:manage", user_id=user_id, ctx=ctx)
    detail = await service.patch_core(
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        patch=payload.patch or {},
        updated_by=user_id,
    )
    return ApiResponse.success(data=detail)
```

- [x] **Step 5: 运行 project settings focused verification 与 onboarding regression**

Passed on `2026-04-22`:
`timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_settings_service_unit.py tests/modules/projects/test_project_core_settings_contract_unit.py tests/modules/workspaces/test_workspace_first_onboarding_state_integration.py`

Result: `7 passed`，workspace onboarding regression 保持通过

- [ ] **Step 6: Commit**

```bash
git add \
  apps/api/src/modules/projects/settings/schema.py \
  apps/api/src/modules/projects/settings/service.py \
  apps/api/src/modules/projects/settings/events.py \
  apps/api/src/modules/projects/governance/router.py \
  apps/api/tests/modules/projects/test_project_settings_service_unit.py \
  apps/api/tests/modules/projects/test_project_core_settings_contract_unit.py \
  apps/api/tests/modules/workspaces/test_workspace_first_onboarding_state_integration.py
git commit -m "feat(api): add project settings service"
```

## Task 5: 同步 OpenAPI 与 Admin API 合同

**Audit Notes Captured After Task 4:**
- project settings 路由已经切到 project-native schema，底层存储仍以 `workspace_id` 作为设置记录键，跨 project 隔离保持在后续 project settings record 独立化阶段完成。
- `ProjectSettingsService._mask_secrets()` 当前通过浅拷贝后改写嵌套 section 字段，后续 settings hardening 需要把 secret masking 收敛成无副作用的数据变换。
- `PATCH /projects/{project_id}/settings/core` 继续承接 `workspace_localization` 驱动的 onboarding 完成逻辑，后续边界清理需要显式决定保留方式。
- `GET /projects/{project_id}/actions` 当前提供的是 project action catalog，Admin 消费层按 action dictionary 语义接入。

**Files:**
- Modify: `packages/openapi/src/generated/types.gen.ts`
- Modify: `packages/openapi/src/generated/sdk.gen.ts`
- Modify: `packages/openapi/src/admin-types.ts`
- Modify: `packages/management-sdk/src/client.ts`
- Modify: `apps/admin/src/types/api/rbac.ts`
- Modify: `apps/admin/src/types/api/index.ts`
- Modify: `apps/admin/src/api/workspaces.ts`
- Modify: `apps/admin/src/api/rbac.ts`
- Modify: `apps/admin/src/api/settings.ts`
- Modify: `apps/admin/src/hooks/use-workspace-permission-access.ts`
- Test: `apps/admin/test/api/project-governance-contract.test.ts`
- Test: `apps/admin/test/api/project-core-settings-contract.test.ts`

- [x] **Step 1: 写 admin contract 单测**

```ts
import { describe, expect, it } from "vitest";
import type { ProjectPermissionAction, ProjectAuthzSnapshot, ProjectSettingsDetail } from "@/types/api";

describe("project governance contracts", () => {
  it("accepts project authz snapshot fields", () => {
    const snapshot: ProjectAuthzSnapshot = {
      projectId: "project-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      scope: "project",
      roleCodes: ["owner"],
      permissionCodes: ["system:site:manage"],
      isSuperuser: false,
    };

    expect(snapshot.scope).toBe("project");
  });

  it("accepts project settings detail fields", () => {
    const detail: ProjectSettingsDetail = {
      namespace: "core",
      value: { site: { name: "Arclayer" } },
      secrets: {},
      updatedAt: null,
    };

    expect(detail.namespace).toBe("core");
  });
});
```

- [x] **Step 2: 生成 OpenAPI SDK 并确认 generated contract 更新**

Passed on `2026-04-22`: `pnpm -C packages/openapi generate`

Observed:
- `packages/openapi/src/generated/types.gen.ts` 新增 `ProjectAuthzSnapshot`、`ProjectPermissionAction`、`ProjectSettingsDetail`、`ProjectSettingsPatch`
- `packages/openapi/src/generated/index.ts` 与 `packages/openapi/src/admin-types.ts` 已导出 project-native contract

- [x] **Step 3: 升级 admin API 类型与 hooks**

```ts
// apps/admin/src/types/api/rbac.ts
export type ProjectPermissionAction = {
  code: string;
  description: string | null;
  subjectKinds: string[];
  permissionCodes: string[];
};

export type ProjectAuthzSnapshot = {
  projectId: string;
  workspaceId: string;
  userId: string;
  scope: "project";
  roleCodes: string[];
  permissionCodes: string[];
  isSuperuser: boolean;
};
```

```ts
// apps/admin/src/api/workspaces.ts
export async function getMyProjectAuthz(projectId: string): Promise<ProjectAuthzSnapshot> {
  return api.get<ProjectAuthzSnapshot>(projectPath(projectId, "/me/authz"));
}
```

```ts
// apps/admin/src/api/rbac.ts
export async function listProjectPermissionActions(
  projectId: string,
): Promise<ProjectPermissionAction[]> {
  return api.get<ProjectPermissionAction[]>(projectPath(projectId, "/actions"));
}
```

```ts
// apps/admin/src/api/settings.ts
export async function getProjectCoreSettings(projectId: string): Promise<ProjectSettingsDetail> {
  return api.get<ProjectSettingsDetail>(projectPath(projectId, "/settings/core"));
}
```

```ts
// apps/admin/src/hooks/use-workspace-permission-access.ts
export function useProjectPermissionAccess(projectId: string | null | undefined) {
  const authzQuery = useQuery({
    queryKey: ["project", "authz", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error("projectId is required");
      return getMyProjectAuthz(projectId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const actionsQuery = useQuery({
    queryKey: ["project", "permission-actions", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error("projectId is required");
      return listProjectPermissionActions(projectId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  return { authzQuery, actionsQuery };
}
```

Implemented additions captured on `2026-04-22`:
- `apps/admin/src/lib/settings/general/adapters.ts` 的 `project` 输入已收敛为 `ProjectSettingsDetail`
- `apps/admin/src/hooks/use-admin-date-time-formatter.ts` 已支持 `projectId` 上下文，并保留现有测试依赖的 helper 导出
- project 页面里的 workspace-backed surface 改为显式使用 `getMyProjectAuthz(projectId).workspaceId`

- [x] **Step 4: 运行 admin contract 测试与类型检查**

Passed on `2026-04-22`:
- `pnpm -C apps/admin test test/api/project-governance-contract.test.ts test/api/project-core-settings-contract.test.ts test/hooks/use-admin-date-time-formatter.test.ts test/pages/settings/general-settings-shell-permissions.test.tsx test/pages/settings/context-settings-pages.test.tsx test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-models-control-center.test.tsx test/pages/workspaces/content/content-automation-page.test.tsx test/pages/workspaces/content/content-release-center-page.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx`
- `pnpm -C apps/admin typecheck`
- `pnpm -C packages/management-sdk typecheck`
- `pnpm -C packages/openapi typecheck`

Result:
- Admin focused group: `11 files passed, 81 tests passed`
- Admin hook test: `1 file passed, 10 tests passed`
- `apps/admin` / `packages/management-sdk` / `packages/openapi` typecheck 全部 exit `0`

- [ ] **Step 5: Commit**

```bash
git add \
  packages/openapi/src/generated/types.gen.ts \
  packages/openapi/src/generated/sdk.gen.ts \
  packages/openapi/src/admin-types.ts \
  packages/management-sdk/src/client.ts \
  apps/admin/src/types/api/rbac.ts \
  apps/admin/src/types/api/index.ts \
  apps/admin/src/api/workspaces.ts \
  apps/admin/src/api/rbac.ts \
  apps/admin/src/api/settings.ts \
  apps/admin/src/hooks/use-workspace-permission-access.ts \
  apps/admin/test/api/project-governance-contract.test.ts \
  apps/admin/test/api/project-core-settings-contract.test.ts
git commit -m "feat(admin): align project governance contracts"
```

## Task 6: 更新 Admin Project Consumers

**Execution Note:** Task 6 的测试夹具与 shared shell mock 需要在同一补丁内一起收敛到 project authz 语义。当前已知高频断点包括仍然引用 `getMyWorkspaceAuthz` 的旧 mock，以及缺失 `useSidebarHoverPreviewLock` 的 shared sidebar mock。

**Files:**
- Modify: `apps/admin/src/pages/projects/settings/site/components/general-settings-shell.tsx`
- Modify: `apps/admin/src/pages/projects/content/library/article-editor/hooks/use-content-library-article-editor.ts`
- Modify: `apps/admin/test/pages/settings/general-settings-shell-permissions.test.tsx`
- Modify: `apps/admin/test/pages/settings/context-settings-pages.test.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-library-page.test.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-models-control-center.test.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-automation-page.test.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-release-center-page.test.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-site-builder-shell.test.tsx`

- [x] **Step 1: 更新 project 页面测试夹具**

```ts
getMyProjectAuthzMock.mockResolvedValue({
  projectId: "project-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  scope: "project",
  roleCodes: ["owner"],
  permissionCodes: ["system:site:manage"],
  isSuperuser: false,
});

listProjectPermissionActionsMock.mockResolvedValue([
  {
    code: "site:manage",
    description: "Manage site",
    subjectKinds: ["workspace_member"],
    permissionCodes: ["system:site:manage"],
  },
]);
```

- [x] **Step 2: 运行现有 project 页面测试确认夹具先失败**

Observed failure mode during Task 6 convergence:
- 旧 mock 仍引用 `getMyWorkspaceAuthz`
- shared sidebar mock 缺失 `useSidebarHoverPreviewLock`
- project consumer 仍混用 project scope 与 workspace-backed scope

这些断点已在同一补丁内一并收敛

- [x] **Step 3: 调整 project consumer 读取逻辑**

```ts
// apps/admin/src/pages/projects/settings/site/components/general-settings-shell.tsx
const permissionAccess = useProjectPermissionAccess(projectId);
const canManageSiteSettings = permissionAccess.hasAction("site:manage");
```

```ts
// apps/admin/src/pages/projects/content/library/article-editor/hooks/use-content-library-article-editor.ts
const projectCoreSettingsQuery = useQuery({
  queryKey: ["project", "core-settings", params.projectId],
  queryFn: async () => getProjectCoreSettings(params.projectId),
});
```

Implemented additions captured on `2026-04-22`:
- `useAdminDateTimeFormatter({ projectId })` 已接入 project 页面日期/本地化 consumer
- 资产上传、封面选择、activity feed 保持 workspace-backed，并统一使用 authz 返回的 `workspaceId`
- 修复 `String(null)` 产生 `"null"` scope 的 asset picker / upload bug
- `content-library-article-editor-page.test.tsx` 新增回归断言，覆盖 project-native 与 workspace-backed 双边界

- [x] **Step 4: 跑完整 project consumer 测试组**

Passed on `2026-04-22`:
`pnpm -C apps/admin test test/api/project-governance-contract.test.ts test/api/project-core-settings-contract.test.ts test/hooks/use-admin-date-time-formatter.test.ts test/pages/settings/general-settings-shell-permissions.test.tsx test/pages/settings/context-settings-pages.test.tsx test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-models-control-center.test.tsx test/pages/workspaces/content/content-automation-page.test.tsx test/pages/workspaces/content/content-release-center-page.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx`

Result: `11 files passed, 81 tests passed`

- [ ] **Step 5: Commit**

```bash
git add \
  apps/admin/src/pages/projects/settings/site/components/general-settings-shell.tsx \
  apps/admin/src/pages/projects/content/library/article-editor/hooks/use-content-library-article-editor.ts \
  apps/admin/test/pages/settings/general-settings-shell-permissions.test.tsx \
  apps/admin/test/pages/settings/context-settings-pages.test.tsx \
  apps/admin/test/pages/workspaces/content/content-library-page.test.tsx \
  apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx \
  apps/admin/test/pages/workspaces/content/content-models-control-center.test.tsx \
  apps/admin/test/pages/workspaces/content/content-automation-page.test.tsx \
  apps/admin/test/pages/workspaces/content/content-release-center-page.test.tsx \
  apps/admin/test/pages/workspaces/content/content-site-builder-shell.test.tsx
git commit -m "feat(admin): migrate project consumers to project contracts"
```

## Task 7: 全链路验证与收口

**Files:**
- Verify only

**Baseline Gate Note:** Task 7 Step 3 记录 broader repo gate 的真实基线状态。当前 API fast-path 已通过，Admin fast-path 仍受现存失败集与 worker OOM 影响。

- [x] **Step 1: 运行 API 定向验证**

Passed on `2026-04-22`:
`timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_settings_service_unit.py tests/modules/projects/test_project_core_settings_contract_unit.py tests/modules/workspaces/test_workspace_first_onboarding_state_integration.py`

Result: `7 passed`

- [x] **Step 2: 运行 admin 定向验证**

Passed on `2026-04-22`:
- `pnpm -C apps/admin test test/api/project-governance-contract.test.ts test/api/project-core-settings-contract.test.ts test/hooks/use-admin-date-time-formatter.test.ts test/pages/settings/general-settings-shell-permissions.test.tsx test/pages/settings/context-settings-pages.test.tsx test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-models-control-center.test.tsx test/pages/workspaces/content/content-automation-page.test.tsx test/pages/workspaces/content/content-release-center-page.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx`
- `pnpm -C apps/admin test test/hooks/use-admin-date-time-formatter.test.ts`

Result:
- Focused group: `11 files passed, 81 tests passed`
- Hook group: `1 file passed, 10 tests passed`

- [ ] **Step 3: 运行 repo fast-path checks**

Run: `pnpm api:check`

Result on `2026-04-22`: `404 passed, 149 skipped, 26 warnings in 129.55s (0:02:09)`，turbo summary `4 successful, 4 total`

Run: `pnpm admin:check`

Current blocker on `2026-04-22`: failed with `13 failed files`, `17 failed tests`, `819 passed`, plus `vitest-pool` worker error after `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`

Representative failing suites observed in the broader Admin baseline:
- `test/components/entity-avatar.test.tsx`
- `test/lib/global-nav-regression.test.ts`
- `test/components/layout/adaptive-overlay-backdrop.test.ts`
- `test/pages/workspaces/assets/assets-page-view.test.tsx`

Status: broader Admin fast-path remains pending until the existing suite failures and memory pressure are cleared

- [ ] **Step 4: 生成最终变更摘要并提交**

```bash
git status --short
git add docs/plans/2026-04-22-project-native-boundary-convergence-implementation-plan.md
git commit -m "docs: add project native boundary convergence plan"
```

## Self-Review Checklist

- Spec coverage: 计划覆盖了 project authz、project action catalog、project core settings schema/service、OpenAPI、admin 合同、后端验证、前端验证。
- Placeholder scan: 文档步骤、代码块、命令块都已填充为可执行内容。
- Type consistency: `ProjectAuthzSnapshot`、`ProjectPermissionActionOut`、`ProjectSettingsDetail` 在后端、OpenAPI、admin 三层保持同名同职责。
