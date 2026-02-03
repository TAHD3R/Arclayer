# Core 能力下沉与边界收敛设计

日期：2026-02-04
范围：`apps/api`
目标：一次性将 core 中业务能力迁移到领域模块，收敛 common/utils 与 Protocol 组织方式。

---

## 1. 背景与问题

当前 `core/` 仍承载大量领域能力（auth/org/workspace/rbac/sites/assets/invitations 等），与“领域模块化”主线冲突；`common/utils` 中存在领域语义工具（assets/passwords）；`tortoise_protocols` 分散在 utils，缺少统一位置。

本次为破坏性一次性迁移，不保留兼容层。

---

## 2. 目标与原则

- core 仅保留框架级基础设施（异常/中间件/日志/HTTP/i18n/数据库生命周期/observability）。
- 领域能力全部下沉至 `modules/<domain>`。
- common 仅保留业务无关工具；Protocol 统一放入 `common/protocols`。
- infra 仅保留外部服务适配。

---

## 3. 迁移映射（一次性）

- `core/auth/deps.py` → `modules/auth/deps.py`
- `core/org/deps.py` → `modules/organization/deps.py`
- `core/organization/{bootstrap,repository}.py` → `modules/organization/`
- `core/workspace/{context,deps,authz,authz_snapshot}.py` → `modules/workspaces/`
- `core/rbac/*` → `modules/system/rbac/*`
- `core/system/deps.py` → `modules/system/deps.py`
- `core/sites/bootstrap.py` → `modules/sites/bootstrap.py`
- `core/assets/{bootstrap,events}.py` → `modules/assets/`
- `core/invitations/{tokens,expiry}.py` → `modules/workspaces/invitations/`
- `common/utils/tortoise_protocols.py` → `common/protocols/tortoise.py`
- `common/utils/assets.py` → `modules/assets/utils.py`
- `common/utils/passwords.py` → `modules/auth/passwords.py`

---

## 4. 关键约束

- core 不得 import `modules`。
- `modules` 可 import `core/common/infra`（单向依赖）。
- `common/utils` 仅保留低语义工具（ids/redact/routing）。
- Protocol 统一入口：`apps.api.common.protocols.tortoise`。

---

## 5. 验收标准

1) `rg "apps.api.core.(auth|org|organization|rbac|workspace|system|sites|assets|invitations)" apps/api` 无命中
2) `rg "common.utils.(assets|passwords|tortoise_protocols)" apps/api` 无命中
3) core 内不再 import `modules`
4) 路由总数保持 151
5) 模型扫描仍为 20 个模型文件

---

## 6. 风险与应对

- 风险：导入路径遗漏导致启动失败或循环依赖。
- 应对：一次性替换+全局 rg 校验+启动验证。
