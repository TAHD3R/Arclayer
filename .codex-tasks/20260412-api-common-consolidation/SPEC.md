# API Common Consolidation

## Goal

收束 `apps/api/src/common` 的目录结构，删除空壳和死代码，把明显错层的 auth-only 能力迁回 auth 模块，并扁平化没有语义收益的微目录路径。

## Scope

- `apps/api/src/common` 目录裁剪与路径扁平化
- `apps/api/src/modules/auth/two_factor` 的 TOTP 能力迁移
- 受影响的 `apps/api/src/**` 与 `apps/api/tests/**` 导入更新
- 聚焦验证与 taskmaster 落盘

## Non-goals

- 重构 `common/email/` 的整体验证与边界
- 修改 API 对外行为或响应契约
- 扩展新的 shared primitive 体系

## Constraints

- 以 live repo truth 为准，不保留兼容 import fallback
- 目录删除前必须先完成引用切换
- 后端测试必须使用 60 秒硬超时
- 只做本轮已验证为“空壳 / 死代码 / auth-only / 机械层级”的切片

## Deliverables

- `docs/plans/2026-04-12-001-api-common-consolidation-implementation-plan.md`
- 更新后的 `apps/api/src/common/**` 目录结构
- 更新后的 auth/two_factor、相关测试与导入路径
- `.codex-tasks/20260412-api-common-consolidation/{SPEC.md,TODO.csv,PROGRESS.md}`

## Done When

- `apps/api/src/common/enums` 被删除
- `apps/api/src/common/content` 被删除，且 repo 内无外部引用
- `apps/api/src/common/security/totp.py` 迁移至 auth two-factor 模块并更新所有引用
- 邀请与 slug helper 的导入不再经过 `*/service.py` 微目录
- 聚焦 pytest 与 `pnpm -C apps/api typecheck` 通过

## Final Validation Command

```bash
timeout 60s pnpm -C apps/api uv -- pytest \
  tests/modules/assets/test_asset_utils_unit.py \
  tests/modules/auth/test_auth_2fa_totp_antireplay_unit.py \
  tests/modules/auth/test_auth_security_endpoints_integration.py \
  tests/modules/workspaces/test_workspace_team_invites_v2_integration.py -q \
  && pnpm -C apps/api typecheck
```
