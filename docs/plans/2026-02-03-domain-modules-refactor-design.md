# 领域模块化重构设计（API/ORM/目录结构）

日期：2026-02-03
范围：`apps/api`
目标：一次性把“技术分层 + 领域分层 + 基础设施分层”混杂结构收敛为“领域模块化”，并配套完成 API 镜像、Tortoise 动态模型发现与测试目录镜像化。

---

## 1. 背景与问题

当前结构存在显著的职责交叉与路径混乱：

- `models/` 集中放置，但业务逻辑散落在 `routers/` 内。
- `routers/` 同时承担路由与业务逻辑，责任过重。
- `core/common/infra` 边界模糊，存在重复职责与模块级代码混入 `core`。
- 测试目录扁平化，随规模扩大难以定位与维护。

本次重构采取“破坏性一次性迁移”，不保留兼容层。

---

## 2. 目标与非目标

### 2.1 目标

- 以“领域模块”为主轴组织业务代码。
- API 层改为领域镜像结构，避免视角型目录（admin/me/public）承载业务。
- Tortoise 模型发现支持 `models.py` 与 `models/` 目录双形态。
- 清理 `core/common/infra` 边界并收敛职责。
- 测试目录与源码结构镜像化。

### 2.2 非目标

- 不保留旧路径或兼容导出层。
- 不在本次改动中引入新功能或扩展能力。

---

## 3. 目标目录结构（核心约束）

```
apps/api
├── main.py
├── config.py
├── core/                      # 框架层：稳定、跨模块基础设施
│   ├── exceptions/
│   ├── middlewares/
│   ├── security/
│   ├── database/              # Tortoise 初始化与模型发现
│   └── logging.py
├── modules/                   # 领域模块
│   ├── auth/
│   │   ├── models.py | models/
│   │   ├── schema.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   ├── deps.py
│   │   └── router.py
│   ├── assets/
│   └── ...
├── infra/                     # 外部服务适配器
│   ├── storage/
│   ├── email/
│   └── cache/
├── api/                       # API 镜像层（仅聚合）
│   ├── router.py              # 根路由聚合（非版本）
│   └── v1/
│       ├── router.py          # v1 聚合入口
│       ├── assets.py
│       ├── auth.py
│       ├── sites.py
│       └── ...
└── tests/
    └── modules/
        └── <domain>/
```

目录命名统一为 `router/service/repository/schema/models`，禁止 `controller/schemas` 混用。

---

## 4. API 镜像与路由聚合策略

- `api/` 层只做路由聚合，不承载业务逻辑。
- 每个领域模块可在 `modules/<domain>/router.py` 内暴露多个 router：
  - `router`（默认）
  - `admin_router`（需要 `/admin` 或 workspace 管理权限）
  - `public_router`（公开访问）
- `api/v1/<domain>.py` 负责把领域 router 挂载到 v1 前缀下，必要时追加 `/admin` 等前缀与标签。
- `api/v1/router.py` 统一聚合所有领域路由（延迟 import 防止循环依赖）。
- `core/routes.py` 只负责调用 `api/router.py` 与 `api/v1/router.py`，不再直接引用模块路径。

---

## 5. Tortoise 动态模型发现

### 5.1 目标

- 自动发现 `apps.api.modules.<domain>.models` 与 `apps.api.modules.<domain>.models.*`。
- 兼容简单模块（`models.py`）与复杂模块（`models/` 目录）。
- 不强行 import 实际模型文件（避免副作用）。

### 5.2 约束

- `modules/` 与各领域目录必须保留空 `__init__.py`。
- 发现逻辑放在 `core/database`，不在 `infra`。

### 5.3 实现建议

- 复用 `pkgutil.iter_modules` + `find_spec` 递归扫描包。
- 命中规则：模块路径包含 `.models` 或 `.models.` 即纳入列表。
- Tortoise config 中 `core_models` 默认改为 `apps.api.modules`。

---

## 6. core/common/infra 边界收敛

- `core` 仅保留框架级基础设施（异常/中间件/日志/配置/数据库生命周期）。
- `infra` 只保留外部服务适配器（存储/邮件/缓存/第三方 API）。
- 目前 `core/assets|auth|workspace|sites|system|rbac` 等领域代码迁移至 `modules/<domain>`。
- `common` 仅放业务无关工具与类型，不放业务逻辑或外部依赖初始化。

---

## 7. 测试目录镜像化

- 目录结构改为 `tests/modules/<domain>/...`。
- 文件命名保持现有习惯（`test_*.py`），但路径与模块镜像对齐。
- 迁移与代码目录同步完成，不保留旧路径。

---

## 8. 一次性迁移步骤（破坏性）

1) 建立 `modules/` 与 `api/` 目标目录结构。
2) 迁移 `routers/` 与 `models/` 代码到 `modules/`。
3) 重写 API 聚合层，替换 `core/routes.py` 路由注册。
4) 将 `infra/db/orm.py` 迁至 `core/database`，更新所有引用。
5) 更新配置 `DB_CORE_MODELS` 默认值与模型扫描逻辑。
6) 一次性修正所有 import 路径。
7) 镜像化迁移测试目录并修复引用。
8) 删除旧 `routers/` 与 `models/` 目录。

---

## 9. 风险与验证

### 9.1 风险

- 大量 import 路径变更导致运行期错误。
- 模型扫描漏掉子模块导致迁移后启动失败。
- 路由聚合顺序变化引入路径冲突。

### 9.2 验证

- 运行应用启动流程（含 Tortoise init 与路由注册）。
- 执行关键集成测试（auth/workspaces/sites/admin 相关）。
- 检查 OpenAPI 是否完整覆盖预期路径。

---

## 10. 路由归属映射（admin/me/public）

| 现有路由组 | 建议领域模块 | 说明 |
| --- | --- | --- |
| `v1/admin/assets` | `modules/assets` | 资产管理（列表/标签/文件夹/批量操作） |
| `v1/admin/uploads` | `modules/assets` | 上传会话与分片 |
| `v1/admin/usages` | `modules/assets` | 资产使用关系 |
| `v1/admin/shares` | `modules/assets` | 资产分享链接 |
| `v1/admin/notifications` | `modules/system` | 工作区通知中心 |
| `v1/admin/menus` | `modules/system` | Admin 菜单服务（依赖插件扩展点） |
| `v1/me` | `modules/organization` | 当前用户组织信息 |
| `v1/public` | `modules/auth` | 仅包含认证路由，直接并入 |

---

## 11. PoC 验证基线（迁移前/迁移后）

### 11.1 迁移前（旧结构）模型扫描（文件系统级）

- `models/` 目录：1
- `models.py` 文件：0
- 发现的模型模块：22
- 模型文件清单（21 个，`__init__.py` 不计）：

```
asset
asset_folder
asset_share
asset_tag
asset_usage
base
notification
org_membership
organization
plugin
rbac
setting
site
site_entry
site_page
site_route_template
theme_package
upload
user
workspace
workspace_invite
```

### 11.2 迁移前（旧结构）API 路由聚合（静态解析）

- router 文件：23
- 路由总数：151

按路由组统计：

```
assets 4
library 1
shares 2
v1/admin/assets 15
v1/admin/menus 8
v1/admin/notifications 6
v1/admin/shares 3
v1/admin/uploads 7
v1/admin/usages 4
v1/auth 12
v1/me 1
v1/sites 39
v1/system 16
v1/workspaces 33
```

### 11.3 迁移后 PoC（2026-02-03）

模型扫描（文件系统级）：

- `models/` 目录：5（assets/organization/sites/system/workspaces）
- `models.py` 文件：0
- 发现的模型模块：20（仅模型文件）
- 模型模块清单：

```
apps.api.modules.assets.models.asset
apps.api.modules.assets.models.asset_folder
apps.api.modules.assets.models.asset_share
apps.api.modules.assets.models.asset_tag
apps.api.modules.assets.models.asset_usage
apps.api.modules.assets.models.upload
apps.api.modules.organization.models.org_membership
apps.api.modules.organization.models.organization
apps.api.modules.organization.models.user
apps.api.modules.sites.models.site
apps.api.modules.sites.models.site_entry
apps.api.modules.sites.models.site_page
apps.api.modules.sites.models.site_route_template
apps.api.modules.system.models.notification
apps.api.modules.system.models.plugin
apps.api.modules.system.models.rbac
apps.api.modules.system.models.setting
apps.api.modules.workspaces.models.theme_package
apps.api.modules.workspaces.models.workspace
apps.api.modules.workspaces.models.workspace_invite
```

API 路由聚合（静态解析，`modules/**/router.py`）：

- router 文件：23
- 路由总数：151

```
assets 4
library 1
shares 2
v1/admin/assets 15
v1/admin/menus 8
v1/admin/notifications 6
v1/admin/shares 3
v1/admin/uploads 7
v1/admin/usages 4
v1/auth 12
v1/me 1
v1/sites 39
v1/system 16
v1/workspaces 33
```

### 11.4 验收结论

- 模型扫描覆盖 20 个 Tortoise 模型文件（`BaseModel` 抽离至 `common/models/base.py` 不再计入 Tortoise 列表）。
- API 路由总数保持 151，路径前缀与语义不变，仅归属模块与聚合入口变化。

---

## 12. 结论

本设计以“领域模块化”为唯一结构主线，配套完成 API 镜像、ORM 模型发现与测试目录镜像化。迁移为破坏性一次性操作，不设兼容层，确保结构清晰、路径稳定与后续扩展可控。
