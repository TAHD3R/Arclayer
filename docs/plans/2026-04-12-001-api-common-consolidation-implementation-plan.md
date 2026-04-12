# Implementation Plan: API Common Consolidation

## Overview
收束 `apps/api/src/common` 的目录边界，删除空壳和死代码，把明显错层的 auth-only 能力迁回 auth 模块，并把只包一层 `service.py` 的微目录扁平化，同时保留真正承担 shared primitives 角色的目录。

## Architecture Decisions
- 保留 `constants`、`models`、`protocols`、`repositories`、`schemas`、`services`、`types`、`utils`。这些目录承担稳定的跨模块基类、协议、类型和工具职责，复用半径明确。
- 删除 `enums` 与 `content`。`enums` 为空目录；`content` 当前零外部引用，且承载的是 content domain 校验逻辑，不是 shared primitive。
- 把 `common/security/totp.py` 迁回 `modules/auth/two_factor/`。该能力只被 2FA 流程使用，属于 auth domain，不应留在 `common/`。
- 扁平化 `common/invitations/*/service.py` 与 `common/text/slug/service.py`。保留 shared 能力本身，但减少没有额外语义价值的目录层级。
- 本轮不重构 `common/email/`。它确实边界偏重，但属于更大的能力切片，单独拆解更安全。

## Dependency Graph
- 目录重映射
  - 先确定每个保留/迁移/删除目标，避免中途反复改路径
- 导入路径变更
  - 代码导入更新后，测试导入必须同步更新
- 目录删除
  - 只能在所有引用切换完成后进行
- 聚焦验证
  - 先跑与变更直接相关的单元/集成测试，再补 typecheck

## Task List

### Phase 1: Freeze Mapping
- [ ] Task 1: 写实现计划与 taskmaster artifacts，冻结目录 target mapping

### Phase 2: Path Consolidation
- [ ] Task 2: 扁平化 shared 微目录并更新导入路径
- [ ] Task 3: 迁移 auth-only / dead code 并删除空壳目录

### Phase 3: Validation
- [ ] Task 4: 跑聚焦验证并收尾 taskmaster 记录

### Checkpoint: Complete
- [ ] `apps/api/src/common` 不再包含 `enums`、`content`、`security`、`text`
- [ ] 邀请和 slug helper 不再走 `*/service.py` 微目录路径
- [ ] 2FA TOTP 不再从 `src.common.security` 导入
- [ ] 聚焦测试与 typecheck 通过

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| 迁移路径后残留旧 import | High | 用 `rg` 明确扫旧路径并把扫描命令写进 TODO 验证项 |
| 删除 `content` 目录误伤未来计划中的能力 | Medium | 先确认当前 repo 零外部引用，只删 repo truth 下的死代码 |
| TOTP 迁移破坏 auth 测试 | Medium | 跑 2FA 相关单测/集成测试作为专门验证 |

## Open Questions
- `common/email/` 的后续迁层应单独开任务，避免与本轮目录压缩混在一起。
