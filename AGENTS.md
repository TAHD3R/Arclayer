# CelestialCMS 项目开发规范（AGENTS）

最后更新：2026-01-29

本仓库为混合技术栈的 Monorepo：前端管理后台（Node.js/pnpm）+ 后端 API（Python/uv/FastAPI）+ 插件系统（plugins）+ 全局 i18n 资源（locales）。

本文档用于统一协作规则，避免在开发/AI 执行过程中出现：

- i18n 文案无规则堆到 `common`，导致文件膨胀、检索困难、LLM 每次读取消耗大量 token
- Codex/沙箱环境运行 `pytest` 因 uv 缓存目录不可写而“卡住/超时”
- 为图省事随意放置文件、提交无用注释、保留死代码

---

## 1) 目录与职责（必须遵守）

- `apps/web/admin/`：后台管理前端（React + i18next + pnpm）
- `apps/api/`：后端 FastAPI 服务（uv 作为运行/依赖管理）
- `packages/`：可复用的包（前端/工具库等）
- `plugins/`：插件（插件可自带 i18n 文案与配置）
- `locales/`：全局 i18n 文案（系统级命名空间）
- `docs/`：项目文档与方案记录（建议按主题拆分，避免单文件膨胀）
- `data/`：运行期本地数据（已在 `.gitignore` 忽略）

规则：

- 禁止把临时文件、脚本、调试产物随意丢在仓库根目录。
- 新增文件必须能回答：**属于哪个模块？为什么放在这里？未来如何维护？**
- 新增目录（尤其是跨模块的）必须补充最小说明（README 或 docs 条目）。

---

## 2) 常用命令（Monorepo 入口统一在根目录）

### 2.1 管理后台（apps/web/admin）

| 任务     | 指令                   | 说明               |
| -------- | ---------------------- | ------------------ |
| 启动开发 | `pnpm dev:admin`       | 启动后台开发服务器 |
| 构建     | `pnpm build:admin`     | 生产构建           |
| Lint     | `pnpm lint:admin`      | ESLint/Linter      |
| 格式化   | `pnpm fmt:admin`       | 格式化             |
| 类型检查 | `pnpm typecheck:admin` | TypeScript         |
| 测试     | `pnpm test:admin`      | 前端单测（Vitest） |

### 2.2 后端 API（apps/api）

后端统一通过 `uv run --project apps/api ...` 执行，**禁止**直接调用 `apps/api/.venv/bin/python`。

| 任务     | 指令                       | 说明             |
| -------- | -------------------------- | ---------------- |
| 启动 API | `pnpm dev:api`             | uvicorn 热重载   |
| Lint     | `pnpm lint:py`             | Ruff             |
| 格式化   | `pnpm format:py`           | Ruff format      |
| 类型检查 | `pnpm typecheck:py`        | Pyright          |
| 单元测试 | `pnpm test:py`             | pytest           |
| 集成测试 | `pnpm test:py-integration` | `-m integration` |

---

## 3) Codex/沙箱环境运行 Python（重点：pytest 不要再卡住/超时）

### 3.1 为什么会“卡住/超时”

在 Codex/沙箱环境下，默认的 uv cache 目录（通常在用户主目录）可能不可写；uv 在启动/同步依赖时尝试写入缓存会导致表现为“长时间无输出/超时/无法运行”。

### 3.2 统一正确做法（强制）

1. **永远用 pnpm 脚本执行后端命令**（根目录已统一设置 `UV_CACHE_DIR=.uv-cache`）。
2. 如果需要手动执行，必须显式设置缓存目录到仓库可写位置：
   - 推荐：`UV_CACHE_DIR=.uv-cache uv run --project apps/api <command>`
   - 备选：`UV_CACHE_DIR=/tmp/uv-cache uv run --project apps/api <command>`

3. 不要用 `apps/api/.venv/bin/python` 直接跑测试或脚本（会绕过 uv 的一致性管理，导致环境漂移）。

### 3.3 pytest 的“正确提速/缩小范围”姿势

当你只需要验证一个点时，不要默认跑全量：

```bash
# 只跑某个文件
pnpm test:py -- apps/api/tests/test_xxx.py

# 只跑某个用例（pytest 节点）
pnpm test:py -- apps/api/tests/test_xxx.py::test_case_name

# 关键字过滤
pnpm test:py -- -k keyword

# 失败即停 + 更少输出（更适合 AI/CI）
pnpm test:py -- -x -q
```

---

## 4) i18n 规范（强制：从现在起不允许再把所有文案塞进 common）

### 4.1 总原则

- 任何用户可见文案必须走 `t()` / `<Trans />`，禁止硬编码。
- 新增词条必须同时补齐 `zh-CN` 与 `en-US`，并保持 key 一致。
- 按“职责/功能域”拆分命名空间（namespace），避免单文件膨胀。
- `common` 只放“真正跨模块的通用词条”（例如：通用按钮文案、通用提示、极少量基础文案）。

### 4.2 命名空间与文件位置（当前基线）

系统级文案放在仓库根目录：

- `locales/<locale>/common.json`：极少量通用文案（不要再膨胀）
- `locales/<locale>/nav.json`：后台导航/菜单相关（`NAV_*`）
- `locales/<locale>/setup.json`：初始化向导相关（`SETUP_*`）
- `locales/<locale>/settings.json`：设置页相关（`SETTINGS_*`）
- `locales/<locale>/account.json`：账号菜单/个人设置入口相关（`ACCOUNT_*`）
- `locales/<locale>/notifications.json`：通知中心/通知列表相关（`NOTIFICATIONS_*`）
- `locales/<locale>/command.json`：命令面板/Command-K 相关（`CMDK_*`）
- `locales/<locale>/assets.json`：资源库相关（`ASSET_*`）

后端/跨端通用：

- `locales/<locale>/errors.json`：错误码 -> 用户提示（建议与后端错误码一致）
- `locales/<locale>/auth.json`：鉴权/登录/重置密码等（后端与前端可共用语义）
- `locales/<locale>/plugin.json`：插件管理相关通用错误/提示

插件自带文案：

- `plugins/<plugin_id>/locales/<locale>/*.json`（由系统自动合并）

### 4.3 Key 命名（保持现有风格，避免无意义重构）

目前项目使用 `UPPER_SNAKE_CASE`，并按前缀区分领域（如 `SETTINGS_*`、`SETUP_*`）。

规则：

- 新 key 必须带“领域前缀”，并放入对应 namespace 文件中。
- 禁止出现“无法判断属于哪个模块”的 key（例如：`TITLE`, `OK`, `TIP1`）。
- 避免把“业务含义”塞到 `common`：能归类就归类。

### 4.4 前端使用方式（推荐）

- 推荐在组件级别显式声明 namespace，减少误用：

````ts
const { t } = useTranslation(\"settings\");\n\nt(\"SETTINGS_SAVE\");\n```

- 需要跨 namespace 时，用 `ns:key` 显式指定：

```ts
t(\"common:REQUEST_FAILED\");\n```

### 4.5 后端/错误码的 i18n（约定）

- 错误对用户展示时优先使用 `errors.json` 的错误码映射。
- i18next 若缺失 key 通常会返回 key 本身；业务层需要将其视为“未翻译”并降级为通用文案。

---

## 5) 代码注释与文件卫生（强制）

### 5.1 注释规则（少而精）

- 不写“显而易见”的注释，不写“解释代码在做什么”的流水账。
- 注释只用于解释：**为什么这样做**、**有哪些坑**、**有哪些约束**。
- 禁止提交：
  - 大段注释掉的代码（需要删掉；历史由 Git 保存）
  - “TODO 以后再说”但没有上下文/issue 链接的注释
  - 与实现不一致/过期的注释

### 5.2 文件放置规则

- 新增功能优先“就近放置”，避免形成新的 “misc/”。
- 跨模块的抽象必须证明可复用，否则不要提前抽象（YAGNI）。
- 任何“临时修复”必须在同一 PR 内完成收敛：要么补测试/文档，要么明确降级方案。

---

## 6) 质量门禁（建议每次提交前至少跑一次）

- 前端：`pnpm lint:admin`、`pnpm typecheck:admin`
- 后端：`pnpm lint:py`、`pnpm typecheck:py`、`pnpm test:py`（按需缩小范围）

---

## 7) 进一步文档

- i18n 详细说明与迁移建议：`docs/i18n.md`
- FastAPI 目录架构：`docs/fastapi-folder-architecture.md`
````
