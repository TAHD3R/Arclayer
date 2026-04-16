# Implementation Plan: Headless CMS v1 Core

## Overview

按 [2026-04-17-headless-cms-v1-core-design.md](/home/philip/Arclayer/docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md) 落地 Arclayer 的 Headless CMS v1 主线。目标不是继续扩散旧的“内容半成品”表层，而是把四个官方协议模型、`Page Resolve`、`Server-side Flattening`、`draft/published/perspective` 隔离语义，以及 `Library-first` Admin IA 收敛成一条可交付、可测试、可继续扩展的主干。

这次实施的第一优先级是稳定合同，而不是 UI 完整度。所有页面和交付能力都必须围绕统一的协议模型、稳定的 route/binding 语义和明确的 publish 边界推进。

## Architecture Decisions

- `workspace` 继续作为用户感知的一等对象，且 `one workspace = one site`；不引入 `project` 作为 v1 的正式对象。
- v1 只开放四个系统官方模型：`Article / Page / Reusable Section / Category`，并且只允许扩展官方模型，不开放完全自定义模型。
- `Header / Footer` 是特殊的 `Reusable Section` 实例，通过 `Layout Slots` 绑定，不作为 `Site Settings` 下的独立内容系统。
- `Page` 是所有路由的唯一真值源；动态页面只支持单个 `primary record context`，`context injection depth = 1`。
- `Section Binding` 使用结构化 `props_mapping`，后端负责 `server-side flattening`，前端不解释表达式。
- `public` 只读取已发布世界；`preview` 优先读取 draft，缺失时回退 published；模型合同和内容版本都使用 draft/published 双指针。
- Admin IA 采用 `Content Library` 为核心、`Models` 为治理切面、`Site Builder` 为情境式页面切面的结构；`Create` 作为 `Content Library` header action 进入。

## Dependency Graph

1. 官方协议模型与模型治理底层合同
   - model registry
   - model contract revision
   - system/custom field boundary
2. 内容与页面版本合同
   - content version pointers
   - page composition snapshot
   - dependency availability rules
3. 路由与交付解析合同
   - route pattern persistence
   - route matcher
   - primary source resolver
   - context assembler
   - section binding resolver
   - flattened page document
4. Admin IA cutover
   - content library action flow
   - models governance surface
   - page item -> site builder handoff
   - site settings boundary cleanup
5. Verification and closeout
   - backend focused integration/unit tests
   - admin focused tests
   - spec/plan truth alignment

## Task List

### Phase 1: Official Model Foundations
- [ ] Task 1: 引入官方协议模型注册表，并把 `Article / Page / Reusable Section / Category` 的系统字段、系统能力和扩展边界显式化
- [ ] Task 2: 为模型治理引入 draft/published contract revision 语义，并建立系统字段与扩展字段的校验链

### Checkpoint: Model Foundation Ready
- [ ] 官方协议模型有稳定注册表和系统字段定义
- [ ] 模型扩展有明确写入边界
- [ ] draft model contract 变更不会直接污染 published contract

### Phase 2: Content Version And Publish Semantics
- [ ] Task 3: 收紧内容版本与页面版本边界，把 `layout / slots / section composition / props mapping` 内聚进 `Page Version`
- [ ] Task 4: 建立 publish safety gate，覆盖 required fields、binding validity、route validity、dependency availability

### Checkpoint: Version Semantics Stable
- [ ] `draft_version / published_version` 读取语义稳定
- [ ] 页面 composition 只随 page revision 切换
- [ ] publish gate 能阻断无效发布

### Phase 3: Route And Delivery Core
- [ ] Task 5: 增加 `PageRoutePattern` 持久化、结构签名冲突校验和 route matcher 优先级实现
- [ ] Task 6: 实现 `PrimarySourceResolver + ContextAssembler(depth=1)`，并明确 `public / preview` 的记录读取策略
- [ ] Task 7: 实现结构化 `props_mapping` 解析与 `server-side flattening`，产出统一的 `FlattenedPageDocument`

### Checkpoint: Resolve Pipeline Complete
- [ ] 静态优先、动态排序、同结构冲突阻断都可验证
- [ ] 动态页面只注入单个 primary record 且深度固定为 1
- [ ] `pages.resolve(path)` 返回 flatten 后的页面 JSON

### Phase 4: Perspective And Dependency Rules
- [ ] Task 8: 将 `public / preview` perspective 合同接入 `pages.resolve` 与依赖读取逻辑
- [ ] Task 9: 为已发布页面依赖 draft-only 或缺失依赖的场景建立正式错误合同与 diagnostics 输出

### Checkpoint: Perspective Isolation Complete
- [ ] `public` 永远不读取 draft 世界
- [ ] `preview` 能优先读取 draft 并在必要时回退
- [ ] `PAGE_DEPENDENCY_UNAVAILABLE` 与 preview diagnostics 行为稳定

### Phase 5: Admin IA Cutover
- [ ] Task 10: 把 `Create` 收回 `Content Library` header action，并用 overlay 承载四个官方协议类型入口
- [ ] Task 11: 将 `Models` 重构为协议模型治理面板，先建立画布式骨架、系统节点、扩展节点和影响分析占位
- [ ] Task 12: 把 `Page` 内容项的打开路径切到情境式 `Site Builder`，并收敛 `Site Settings` 只保留系统级职责

### Checkpoint: Admin Flow Coherent
- [ ] 用户从 `Content Library` 进入创建、治理和页面构建流程
- [ ] `Models` 的语义从表层列表转为协议治理
- [ ] `Site Settings` 不再承担 Header/Footer 正文编辑职责

### Phase 6: Validation And Closeout
- [ ] Task 13: 跑聚焦 backend/admin 验证，补充缺口测试，并确保已发布交付不受 draft model contract 影响
- [ ] Task 14: 对齐 spec、implementation plan 与真实 repo 状态，清理遗留表层叙事和错误入口

### Checkpoint: Complete
- [ ] backend focused tests pass
- [ ] admin focused tests pass
- [ ] `pages.resolve` 的 public/preview 行为有稳定覆盖
- [ ] `Content Library / Models / Site Builder / Site Settings` 的职责边界与 spec 一致

## Task Details

### Task 1: Official protocol model registry

**Description:** 建立系统官方模型注册表，并将四个官方模型的 system fields、capabilities、route/binding/delivery 参与范围显式化，避免后续逻辑继续从零散 capability 推导产品真相。

**Acceptance criteria:**
- [ ] `Article / Page / Reusable Section / Category` 的系统字段定义可从单一注册表读取
- [ ] 系统字段和扩展字段的区分进入后端合同层
- [ ] 现有内容创建和读取逻辑能识别官方模型协议身份

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_unit.py tests/modules/workspaces/test_workspace_content_contracts_unit.py`

**Dependencies:** None

**Files likely touched:**
- `apps/api/src/modules/workspaces/content/contracts/schema.py`
- `apps/api/src/modules/workspaces/content/models/canonical_service.py`
- `apps/api/src/modules/workspaces/content/models/domain_helpers.py`
- `apps/api/tests/modules/workspaces/content/test_content_models_unit.py`
- `apps/api/tests/modules/workspaces/test_workspace_content_contracts_unit.py`

**Estimated scope:** Medium

### Task 2: Model contract revisions and extension validation

**Description:** 为官方模型治理增加 draft/published contract revision 语义，并建立模型扩展写入校验，确保未发布模型变更不会直接破坏 published delivery contract。

**Acceptance criteria:**
- [ ] 模型合同存在 draft/published 双指针或等价显式状态
- [ ] 扩展字段写入会校验系统字段不可破坏
- [ ] published delivery 读取 published contract revision

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_integration.py tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py`

**Dependencies:** Task 1

**Files likely touched:**
- `apps/api/src/models/content/model_definition.py`
- `apps/api/src/modules/workspaces/content/models/repository.py`
- `apps/api/src/modules/workspaces/content/models/canonical_service.py`
- `apps/api/tests/modules/workspaces/content/test_content_models_integration.py`
- `apps/api/tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py`

**Estimated scope:** Medium

### Task 3: Page version composition snapshot

**Description:** 把 page-level layout、slots、section composition、props mapping 收敛成 `Page Version` 的正式快照边界，确保 public delivery 读取 published page snapshot，draft 变更只影响 preview。

**Acceptance criteria:**
- [ ] 页面 composition 数据与 page revision 同步切换
- [ ] published 页面不会读取 draft composition
- [ ] page version 读取合同在 API 和 resolve 层保持一致

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_presentations_integration.py tests/modules/workspaces/content/test_content_items_integration.py`

**Dependencies:** Task 2

**Files likely touched:**
- `apps/api/src/modules/workspaces/content/items/canonical_service.py`
- `apps/api/src/modules/workspaces/content/items/read_service.py`
- `apps/api/src/modules/workspaces/content/presentations/router.py`
- `apps/api/tests/modules/workspaces/content/test_content_presentations_integration.py`
- `apps/api/tests/modules/workspaces/content/test_content_items_integration.py`

**Estimated scope:** Medium

### Task 4: Publish safety gate

**Description:** 在 publish 前统一校验 required fields、binding resolution、route validity 和 dependency availability，阻断会破坏 public delivery 的状态进入 published 世界。

**Acceptance criteria:**
- [ ] 无效 route/binding/dependency 会阻断 publish
- [ ] publish 失败返回显式错误合同
- [ ] 不存在 silent fallback 或跳过校验的发布路径

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_items_transition_guards_integration.py tests/modules/workspaces/content/test_content_items_continuation_contract_integration.py`

**Dependencies:** Task 3

**Files likely touched:**
- `apps/api/src/modules/workspaces/content/items/canonical_service.py`
- `apps/api/src/modules/workspaces/content/continuation.py`
- `apps/api/tests/modules/workspaces/content/test_content_items_transition_guards_integration.py`
- `apps/api/tests/modules/workspaces/content/test_content_items_continuation_contract_integration.py`

**Estimated scope:** Medium

### Task 5: Route pattern persistence and matcher

**Description:** 引入正式的 `PageRoutePattern` 语义，实现静态优先、动态特异性排序和同结构冲突校验，替换只靠 path binding 的当前简化路线。

**Acceptance criteria:**
- [ ] route pattern 支持 `static` 与 `dynamic`
- [ ] `/blog/new` 优先于 `/blog/:slug`
- [ ] `/blog/:slug` 与 `/blog/:id` 在写入阶段直接冲突

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_routing_integration.py tests/modules/sites/test_sites_canonical_content_runtime_integration.py`

**Dependencies:** Task 2

**Files likely touched:**
- `apps/api/src/modules/workspaces/content/routing/schema.py`
- `apps/api/src/modules/workspaces/content/routing/service.py`
- `apps/api/src/modules/sites/publishing/routes/resolve/service.py`
- `apps/api/tests/modules/workspaces/content/test_content_routing_integration.py`
- `apps/api/tests/modules/sites/test_sites_canonical_content_runtime_integration.py`

**Estimated scope:** Medium

### Task 6: Primary source resolver and context assembler

**Description:** 为动态页面实现单记录 `primary source` 解析，并构造 `depth=1` 的 `context.primary`，让 `Page Resolve` 拥有稳定的上下文注入语义。

**Acceptance criteria:**
- [ ] 动态页面只加载一个 primary record
- [ ] primary 自身字段完整可用
- [ ] 一跳关系能输出摘要对象，二跳关系不进入 resolve 合同

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_canonical_content_runtime_integration.py`

**Dependencies:** Task 5

**Files likely touched:**
- `apps/api/src/modules/sites/publishing/routes/resolve/content/service.py`
- `apps/api/src/modules/sites/publishing/includes/service.py`
- `apps/api/src/modules/sites/runtime/schema.py`
- `apps/api/tests/modules/sites/test_sites_canonical_content_runtime_integration.py`

**Estimated scope:** Medium

### Task 7: Structured props mapping and server-side flattening

**Description:** 将 `Section Binding` 改造成结构化 `props_mapping`，并在后端执行 `props_defaults + props_mapping -> flattened props`，输出可直接消费的页面 JSON。

**Acceptance criteria:**
- [ ] `props_mapping` 使用结构化 JSON，而不是模板字符串
- [ ] v1 支持 `context_path` 与 `literal` 两种 mapping kind
- [ ] `pages.resolve` 输出 flatten 后的 section props

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_canonical_content_runtime_integration.py`

**Dependencies:** Task 6

**Files likely touched:**
- `apps/api/src/modules/workspaces/content/bindings/router.py`
- `apps/api/src/modules/sites/publishing/routes/resolve/content/service.py`
- `apps/api/src/modules/sites/runtime/schema.py`
- `apps/api/tests/modules/sites/test_sites_canonical_content_runtime_integration.py`

**Estimated scope:** Medium

### Task 8: Perspective-aware resolve

**Description:** 把 `public / preview` perspective 合同接入 `pages.resolve`，确保 public 永远只读取 published 世界，preview 优先 draft 并在缺失时回退 published。

**Acceptance criteria:**
- [ ] `public` 不读取任何 draft content 或 draft model contract
- [ ] `preview` 优先 draft，缺失时回退 published
- [ ] resolve payload 明确暴露 revision 与 revision_state

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_canonical_content_runtime_integration.py tests/modules/workspaces/content/test_content_items_integration.py`

**Dependencies:** Task 7

**Files likely touched:**
- `apps/api/src/modules/sites/publishing/routes/resolve/content/service.py`
- `apps/api/src/modules/sites/runtime/schema.py`
- `apps/api/tests/modules/sites/test_sites_canonical_content_runtime_integration.py`
- `apps/api/tests/modules/workspaces/content/test_content_items_integration.py`

**Estimated scope:** Small

### Task 9: Dependency availability and diagnostics

**Description:** 处理“Page 已发布但依赖对象仍是 draft 或缺失”的场景，给 `public` 和 `preview` 定义正式错误合同与 diagnostics 行为。

**Acceptance criteria:**
- [ ] public 对无 published dependency 的页面返回 `PAGE_DEPENDENCY_UNAVAILABLE`
- [ ] preview 对可回退依赖返回 warning，对 required 且缺失依赖返回 `PAGE_PREVIEW_DEPENDENCY_UNAVAILABLE`
- [ ] 历史脏数据不会被 silent fallback 吞掉

**Verification:**
- [ ] Focused tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_canonical_content_runtime_integration.py`

**Dependencies:** Task 8

**Files likely touched:**
- `apps/api/src/modules/sites/publishing/routes/resolve/content/service.py`
- `apps/api/src/modules/sites/runtime/schema.py`
- `apps/api/tests/modules/sites/test_sites_canonical_content_runtime_integration.py`

**Estimated scope:** Small

### Task 10: Library-first create overlay

**Description:** 把 `Create` 从独立页面心智收回到 `Content Library` header action，通过 overlay 暴露四个官方协议类型入口，并与现有 `/content/create` 逐步完成语义替换。

**Acceptance criteria:**
- [ ] 用户从 `Content Library` header action 进入新建流程
- [ ] overlay 只展示四个官方协议类型
- [ ] 旧 `/content/create` 不再承担主叙事

**Verification:**
- [ ] Tests pass: `pnpm -C apps/admin test -- test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-bootstrap-page.test.tsx test/pages/workspaces/content/content-bootstrap-controller.test.tsx`

**Dependencies:** Task 1

**Files likely touched:**
- `apps/admin/src/pages/workspaces/content/library/page.tsx`
- `apps/admin/src/pages/workspaces/content/library/components/content-library-new-content-button.tsx`
- `apps/admin/src/pages/workspaces/content/bootstrap/page.tsx`
- `apps/admin/test/pages/workspaces/content/content-library-page.test.tsx`
- `apps/admin/test/pages/workspaces/content/content-bootstrap-page.test.tsx`

**Estimated scope:** Medium

### Task 11: Models governance surface

**Description:** 将 `Models` 从半成品 control center 收敛为协议治理面板，先实现画布式骨架、锁定系统节点、扩展字段节点与 impact inspector 占位，不在这一阶段追完整图编辑器能力。

**Acceptance criteria:**
- [ ] `Models` 主叙事变为协议治理，而不是通用表单
- [ ] 系统字段与扩展字段在视觉上有明确区分
- [ ] 影响范围有真实 contract-based inspector 占位

**Verification:**
- [ ] Tests pass: `pnpm -C apps/admin test -- test/pages/workspaces/content/content-models-control-center.test.tsx`

**Dependencies:** Task 2

**Files likely touched:**
- `apps/admin/src/pages/workspaces/content/models/page.tsx`
- `apps/admin/test/pages/workspaces/content/content-models-control-center.test.tsx`

**Estimated scope:** Medium

### Task 12: Page item handoff to site builder and site settings cleanup

**Description:** 让 `Page` 内容项从 `Content Library` 情境进入 `Site Builder`，同时把 `Site Settings` 收敛为系统级设置面，剥离 header/footer 正文与 global block 文案的职责。

**Acceptance criteria:**
- [ ] `Page` 内容项能按内容类型与交付属性进入 `Site Builder`
- [ ] `Site Settings` 只保留 identity、domains、localization、SEO defaults、preview/delivery policy、slot binding policy
- [ ] Header/Footer 内容编辑不再落在 `Site Settings`

**Verification:**
- [ ] Tests pass: `pnpm -C apps/admin test -- test/pages/workspaces/content/content-site-builder-shell.test.tsx`
- [ ] Build succeeds: `pnpm admin:check`

**Dependencies:** Task 7, Task 10

**Files likely touched:**
- `apps/admin/src/pages/workspaces/content/library/item-resolver/page.tsx`
- `apps/admin/src/pages/workspaces/content/site-builder/page.tsx`
- `apps/admin/src/pages/workspaces/settings/site/components/general-settings-shell.tsx`
- `apps/admin/test/pages/workspaces/content/content-site-builder-shell.test.tsx`

**Estimated scope:** Medium

### Task 13: Verification sweep

**Description:** 跑 backend/admin 聚焦验证，补齐缺失测试，确认 public delivery 不受 draft model contract 污染，并记录实际仍未闭合的缺口。

**Acceptance criteria:**
- [ ] 聚焦 backend 验证通过
- [ ] 聚焦 admin 验证通过
- [ ] 已发布交付与 draft contract 隔离有证据

**Verification:**
- [ ] Backend checks pass
- [ ] Admin checks pass

**Dependencies:** Task 12

**Files likely touched:**
- `apps/api/tests/modules/...`
- `apps/admin/test/pages/...`

**Estimated scope:** Small

### Task 14: Closeout and truth cleanup

**Description:** 更新 spec/plan 与真实 repo 状态，清理错误入口、旧叙事和不再成立的页面职责，避免文档和代码再次分叉。

**Acceptance criteria:**
- [ ] 文档与 repo 行为一致
- [ ] 旧入口和旧表述不再宣称为主路径
- [ ] closeout 总结只基于已验证结果

**Verification:**
- [ ] `git diff --stat` shows focused changes
- [ ] plan remains aligned with repo truth

**Dependencies:** Task 13

**Files likely touched:**
- `docs/plans/2026-04-17-headless-cms-v1-core-implementation-plan.md`
- related docs/tests/routes touched during earlier tasks

**Estimated scope:** Small

## Checkpoints

### Checkpoint: After Tasks 1-2
- [ ] 官方协议模型和 model governance 边界稳定
- [ ] draft model contract 不污染 published contract

### Checkpoint: After Tasks 3-7
- [ ] 页面版本、路由匹配、primary context、props mapping、flattening 主干跑通

### Checkpoint: After Tasks 8-9
- [ ] `public / preview` perspective 和依赖降级语义稳定

### Checkpoint: After Tasks 10-12
- [ ] `Content Library / Models / Site Builder / Site Settings` 的职责边界与 spec 一致

### Checkpoint: Complete
- [ ] 所有聚焦验证通过
- [ ] 已发布 delivery 与 draft 世界的隔离有明确测试证据
- [ ] 文档与 repo truth 对齐

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 当前内容系统仍残留旧的 page-centric / heuristic path，导致新合同被旧逻辑旁路 | High | 先把 route resolve、item resolver、site builder handoff 的真实入口查清，再做 cutover；用 focused integration tests 锁住 |
| 模型治理 revision 与内容 revision 混在一起，导致 publish 边界不清 | High | 先单独引入 model contract revision 语义，再接 publish gate；不要把模型编辑直接塞进内容版本 |
| `props_mapping` 改造过大，短期内打断现有 editor / delivery 兼容 | High | v1 先支持最小 `context_path + literal`，并让 flattening 在新合同上增量落地，不一次引入表达式系统 |
| Admin IA 改造容易退回“多菜单并列”或“页面壳体先行” | Medium | 始终以 `Content Library` 为主平面；Models 和 Site Builder 只作为治理/情境入口推进 |
| `Site Settings` 与 global sections 职责拆分不彻底，后续会形成两套全局内容系统 | Medium | 在同一阶段明确“绑定规则留在 settings，内容正文回到 sections”的切线，并用 UI copy 与路由入口一起收紧 |

## Open Questions

- `Dataset / Workspace / Project / Runtime` 的正式关系仍在研究基线中保留，当前 implementation plan 不把它纳入 v1 Core 的施工范围。
