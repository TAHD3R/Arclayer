# Progress

## Session Start

- **Date**: 2026-04-12 23:00
- **Task name**: `20260412-api-common-consolidation`
- **Task dir**: `.codex-tasks/20260412-api-common-consolidation/`
- **Spec**: `SPEC.md`
- **Plan**: `TODO.csv` (4 milestones)
- **Environment**: Python / FastAPI / pytest + pyright

## Context Recovery Block

- **Current milestone**: #3 — Move auth-only and dead code out of common then remove empty dirs
- **Current milestone**: #4 — Run focused validation and close taskmaster records
- **Current status**: DONE
- **Last completed**: #3 — Move auth-only and dead code out of common then remove empty dirs
- **Current artifact**: `.codex-tasks/20260412-api-common-consolidation/TODO.csv`
- **Key context**: 目录收束与路径迁移已完成，聚焦 pytest 与 pyright 均通过。本任务可从 TODO/SPEC/PROGRESS 直接恢复或审计。
- **Known issues**: `docs/plans/` 当前为空；同日已有其他 `.codex-tasks/20260412-*` 任务，需保持命名隔离。
- **Next action**: 无；任务已完成。

## Milestone 1: Write plan and taskmaster artifacts with frozen target mapping

- **Status**: DONE
- **Started**: 12:44
- **Completed**: 12:44
- **What was done**:
  - 写入实现计划文档到 `docs/plans/2026-04-12-001-api-common-consolidation-implementation-plan.md`
  - 初始化 `.codex-tasks/20260412-api-common-consolidation/{SPEC.md,TODO.csv,PROGRESS.md}`
  - 回读 artifacts，确认 task boundary 与 TODO 验证命令一致
- **Key decisions**:
  - Decision: 使用 `single-full` 而不是 epic
  - Reasoning: 本轮只有一个交付目标，虽跨多个文件，但仍可在一个 shared context 内推进
  - Alternatives considered: epic；放弃，因为没有独立子交付链
- **Problems encountered**:
  - Problem: `docs/plans/` 目录为空，需要先确认不是仓库禁用
  - Resolution: 直接验证目录存在并将本轮计划作为首个 plan 文件落盘
  - Retry count: 0
- **Validation**: `test -f docs/plans/2026-04-12-001-api-common-consolidation-implementation-plan.md && test -f .codex-tasks/20260412-api-common-consolidation/SPEC.md && test -f .codex-tasks/20260412-api-common-consolidation/TODO.csv && test -f .codex-tasks/20260412-api-common-consolidation/PROGRESS.md` -> exit 0
- **Files changed**:
  - `docs/plans/2026-04-12-001-api-common-consolidation-implementation-plan.md` — 写入本轮实现计划
  - `.codex-tasks/20260412-api-common-consolidation/SPEC.md` — 定义任务边界与最终验证
  - `.codex-tasks/20260412-api-common-consolidation/TODO.csv` — 建立 4 个里程碑
  - `.codex-tasks/20260412-api-common-consolidation/PROGRESS.md` — 初始化恢复锚点
- **Next step**: Milestone 2 — Flatten common micro-packages and update imports

## Milestone 2: Flatten common micro-packages and update imports

- **Status**: DONE
- **Started**: 12:44
- **Completed**: 12:46
- **What was done**:
  - 新增 `apps/api/src/common/invitations/{tokens.py,expiry.py}`
  - 新增 `apps/api/src/common/utils/slug.py`
  - 更新所有 src/tests 里对旧 `*/service.py` 微路径的导入
- **Key decisions**:
  - Decision: 先新增扁平化文件，再删旧目录
  - Reasoning: 迁移和删除分步做，能把排错范围限制在导入切换本身
  - Alternatives considered: 直接 move + delete；放弃，因为一旦导入漏改更难定位
- **Problems encountered**:
  - Problem: 无
  - Resolution: 无
  - Retry count: 0
- **Validation**: `! rg -n "src\\.common\\.(invitations\\.(expiry|tokens)\\.service|text\\.slug\\.service)" apps/api/src apps/api/tests` -> exit 0
- **Files changed**:
  - `apps/api/src/common/invitations/tokens.py` — 新增扁平化邀请 token helper
  - `apps/api/src/common/invitations/expiry.py` — 新增扁平化邀请过期时间 helper
  - `apps/api/src/common/utils/slug.py` — 新增扁平化 slug helper
  - `apps/api/src/modules/**` — 更新 invitations/slug 导入
  - `apps/api/tests/modules/**` — 更新测试导入
- **Next step**: Milestone 3 — Move auth-only and dead code out of common then remove empty dirs

## Milestone 3: Move auth-only and dead code out of common then remove empty dirs

- **Status**: DONE
- **Started**: 12:46
- **Completed**: 12:48
- **What was done**:
  - 新增 `apps/api/src/modules/auth/two_factor/totp.py`
  - 更新 auth two-factor 服务与测试对 TOTP 的导入
  - 删除 `common/content`、`common/security`、`common/text`、`common/enums` 以及 invitations 旧微目录
- **Key decisions**:
  - Decision: 将 TOTP 直接并入 auth two-factor 子域
  - Reasoning: 该能力当前只被 2FA 流程消费，继续留在 `common/` 只会制造错层
  - Alternatives considered: 保留 `common/security`；放弃，因为没有跨域复用证据
- **Problems encountered**:
  - Problem: 旧目录下存在 `__pycache__`，会阻挡空目录清理
  - Resolution: 删除任务范围内的旧目录树，确保 repo 结构与导入路径同步收束
  - Retry count: 0
- **Validation**: `! rg -n "src\\.common\\.(security\\.totp|content)" apps/api/src apps/api/tests && test ! -d apps/api/src/common/enums && test ! -d apps/api/src/common/content && test ! -d apps/api/src/common/security && test ! -d apps/api/src/common/text` -> exit 0
- **Files changed**:
  - `apps/api/src/modules/auth/two_factor/totp.py` — 新增 auth-only TOTP 实现
  - `apps/api/src/modules/auth/two_factor/service.py` — 改用域内 TOTP 实现
  - `apps/api/tests/modules/auth/*.py` — 更新 TOTP 导入
  - `apps/api/src/common/**` — 删除死代码与空壳目录
- **Next step**: Milestone 4 — Run focused validation and close taskmaster records

## Milestone 4: Run focused validation and close taskmaster records

- **Status**: DONE
- **Started**: 12:48
- **Completed**: 12:49
- **What was done**:
  - 运行聚焦 pytest，覆盖 slug、2FA、invite 路径变更
  - 运行 `pnpm -C apps/api typecheck`
  - 记录最终验证结果并关闭 TODO
- **Key decisions**:
  - Decision: 先跑聚焦 pytest，再跑 pyright
  - Reasoning: 目录/导入迁移最容易先在运行时或导入层出错，pytest 能更快给出失败面
  - Alternatives considered: 直接跑全量 `api:check`；放弃，因为本轮是窄改动，聚焦验证更高效
- **Problems encountered**:
  - Problem: 集成测试项默认被 skip
  - Resolution: 保持 repo truth，不造假开启条件；保留 unit/path coverage 并补 pyright 兜底
  - Retry count: 0
- **Validation**: `timeout 60s pnpm -C apps/api uv -- pytest tests/modules/assets/test_asset_utils_unit.py tests/modules/auth/test_auth_2fa_totp_antireplay_unit.py tests/modules/auth/test_auth_security_endpoints_integration.py tests/modules/workspaces/test_workspace_team_invites_v2_integration.py -q && pnpm -C apps/api typecheck` -> exit 0
- **Files changed**:
  - `.codex-tasks/20260412-api-common-consolidation/TODO.csv` — 全里程碑收口
  - `.codex-tasks/20260412-api-common-consolidation/PROGRESS.md` — 记录最终验证与总结
- **Next step**: None

## Final Summary

- **Total milestones**: 4
- **Completed**: 4
- **Failed + recovered**: 0
- **External unblock events**: 0
- **Total retries**: 0
- **Files created**: 6
- **Files modified**: 16
- **Key learnings**:
  - `common/` 目录过多的问题主要来自“错层能力”和“只包一层 service.py 的微目录”，不是 base/protocol/type 这些 shared primitive 本身。
  - 用“先迁移导入、后删旧目录”的两步法能明显降低目录收束的回归风险。
- **Recommendations for future tasks**:
  - `common/email/` 应作为单独任务拆分，不应与本轮目录压缩混做。
