# Arclayer 代理指南

面向自动编码代理的可执行规则——保持差异最小、安全、与仓库对齐。

## 事实源路由

每次改动都按这个模型路由：

- 实现契约（权威）：`docs/spec/**`
- 产品方向与实施计划：`docs/plan/**`（当前方向权威：`docs/plan/ai-builder-product-direction.md`）
- 非规范指导：`docs/guidelines/**`
- 视觉语言权威：`DESIGN.md`
- Product 与 Platform 实现指导：`docs/guidelines/frontend-design.md`
- 架构决策记录：`docs/adr/**`

## 仓库地图

- Monorepo：Turborepo + pnpm workspace
- Product Application：`apps/app`（`@arclayer/app`）——面向客户的产品
- Server/API：`apps/api`（`@arclayer/api`）——共享后端与 API 组合
- Platform 管理台：`apps/platform`（`@arclayer/platform`）——部署级管理
- 共享包：`packages/**`
- 插件扩展：`plugins/*`（非 pnpm workspace）

不要把 `admin` 当作 Product Application 的同义词。`admin` 仅在真正的管理域、权限和遗留外部契约中仍然有效。请求说「app」时改 `apps/app`；说「管理台」或部署级管理时改 `apps/platform`；服务端工作属于 `apps/api`。

## 命令纪律

只使用仓库脚本：

- `pnpm <script>`
- `pnpm --filter <pkg> <script>`
- `pnpm -C <dir> <script>`

禁止：

- 直接运行 `.venv/bin/*`
- 手改生成产物
- 除非明确要求，不运行长期开发服务器

## 阶段验证

验证力度与改动及其里程碑成比例；不要在每次小改动后运行包级或仓库级门禁。

- 孤立改动期间：运行最接近的相关静态检查和聚焦测试。只重跑被后续编辑失效的检查。
- 一个完整里程碑或交付前：运行受影响的包门禁——API 工作用 `pnpm api:check`，Product Application 工作用 `pnpm app:check`，Platform 工作用 `pnpm platform:check`。
- 跨应用集成或最终交付、且范围足以证明仓库级门禁合理时，运行 `pnpm check`。
- 聚焦后端测试使用包脚本，例如 `pnpm -C apps/api test tests/path/to_test.py::test_name`；60 秒超时是诊断默认值而非硬门禁。集成、数据库或天然较慢的测试要给足时间，让最终通过/失败结果完整暴露。
- Product Application 的聚焦 Vitest 路径直接传入，例如 `pnpm --filter @arclayer/app test test/components/layout/route-progress.test.tsx`。Platform 同样使用直接路径形式。不要在路径前多插 `--`，也不要依赖 pnpm 与 Vitest 之间的分隔符行为；那会破坏文件过滤意图并触发更大范围的运行。

## guidelines 目录政策

`docs/guidelines/**` 只存放非规范指导。

- 只保留可跨任务复用的长期指导；活跃清单以 `docs/guidelines/README.md` 为准。
- 方向备忘录、实施计划与执行记录属于 `docs/plan/**`，不落入本目录。
- 不从 `docs/guidelines/**` 路由实现契约。

## 前端执行契约

- 前端活跃范围：`apps/app`、`apps/platform`，以及 `packages/ui` 中面向应用的表面
- `DESIGN.md` 是视觉语言第一权威
- 设计敏感改动须对齐 `docs/guidelines/frontend-design.md`
- 优先复用 `@arclayer/ui`；缺失的通用基础组件通过配置好的 shadcn Registry 安装，不手造替代品
- 图标使用 `lucide-react`，图表使用 `@arclayer/ui/chart` 背后 Arclayer 适配的 Bklit 实现；不引入竞争的图标或图表技术栈
- 页面级 loading、error、empty 状态保持显式
- 所有新产品文案必须使用稳定 i18n key，并同时提供 `zh-CN` 与 `en-US` 资源
- 用平实语言为用户的任务和下一步动作写作。不在普通产品 UI 中暴露 README 指令、组件/API 名、原始错误、日志、JSON、哈希或内部架构；必要的诊断放进显式详情表面
- `docs/spec/app/frontend/product-ui-toolchain.md` 是权威 UI 工具链契约

## 仓库智能工作流

中等以上任务、架构问题或多文件重构：

1. `GitNexus` 用于发现与影响分析
2. `code-review-engine`（`scripts/code-review-engine`，根脚本 `pnpm code-review-engine`）变更审计提供仓库规则审查上下文
3. 环境可用时使用符号/LSP 工具做定点精度

索引过期或不可用时，以仓库实况为准。

## 沟通规范

- 面向用户的回复默认使用中文，除非用户明确要求其他语言。
- 提交信息一律使用英文。
- 最终答复末尾不提议后续任务或增强项。

## 安全基线

- 禁止静默降级与 mock 假成功路径。
- 硬切改动后保持唯一权威契约表面。
- 同一发布内移除被取代的 shim/facade，除非明确批准保留。
- 除非任务需要，不触碰 lockfile、缓存、构建产物或 `node_modules/`。

## 文档语言政策

- `docs/spec/**` 契约正文使用英文，与代码标识符保持一致。
- 根文档（本文件、`DESIGN.md`）以及 `docs/plan/**`、`docs/guidelines/**` 中新写或重写的文档使用中文；存量英文指导不强制回译。

## Agent skills

### Issue tracker

Issues 跟踪于 GitHub Issues（`TAHD3R/Arclayer`），通过 `gh` CLI 操作。见 `docs/agents/issue-tracker.md`。

### Triage labels

默认 triage 标签词汇表（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）。见 `docs/agents/triage-labels.md`。

### Domain docs

单一上下文：根 `CONTEXT.md` + `docs/adr/`。见 `docs/agents/domain.md`。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Arclayer** (107816 symbols, 170783 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Arclayer/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Arclayer/clusters` | All functional areas |
| `gitnexus://repo/Arclayer/processes` | All execution flows |
| `gitnexus://repo/Arclayer/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
