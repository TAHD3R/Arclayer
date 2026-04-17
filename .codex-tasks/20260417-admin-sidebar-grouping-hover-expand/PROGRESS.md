# Progress Log

> Auto-maintained by Taskmaster. Each entry records what happened, why, and what's next.
> This file serves as both decision audit trail and context-recovery anchor.

---

## Session Start

- **Date**: 2026-04-17 05:57
- **Task name**: `20260417-admin-sidebar-grouping-hover-expand`
- **Task dir**: `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/`
- **Spec**: See `SPEC.md`
- **Plan**: See `TODO.csv` (5 milestones)
- **Environment**: `TypeScript / React / Vitest`

---

## Context Recovery Block

> If you are resuming this task after compaction, session restart, or context loss,
> read this section FIRST to restore working state.

- **Current milestone**: `#23 — Re-run focused verification for synced marker and overlay regressions`
- **Current status**: `DONE`
- **Last completed**: `#23 — Re-run focused verification for synced marker and overlay regressions`
- **Current artifact**: `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv`
- **Key context**: 最新 follow-up 已完成。`NavGroupMarker` 现在在 collapsed 态与 `NavDivider` 共享同构 row owner，内部 divider line 与 label reveal 使用同一条 250ms 曲线；`NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME` 去掉了导致 icon snap 的 `justify-center` 跳变，collapsed leaf/group 顶层按钮改为同一套左锚点 padding contract；`NAV_ITEM_COLLAPSE_HIDE_CLASSNAME`、icon motion 和 shared sidebar width timing 也统一到同一节奏。overlay hover-preview 的 `layoutState` / `visualState` focused suite 继续全绿。
- **Known issues**: 更大范围的 `pnpm admin:check` 仍有与本任务无关的既有失败，集中在 `usercenter-overlay-host.test.tsx`、`assets-page-view.test.tsx`、`tooltip-content-sync.test.tsx`。
- **Next action**: 任务处于可提交状态。

---

## Milestone 1: Create task artifacts

- **Status**: DONE
- **Started**: 05:57
- **Completed**: 05:57
- **What was done**:
  - 初始化 single-full task 目录。
  - 写入 `SPEC.md`、`TODO.csv`、`PROGRESS.md`。
- **Key decisions**:
  - Decision: 使用 single-full 而不是 compact。
  - Reasoning: 任务跨共享 primitive、菜单常量、i18n 和测试，且需要可恢复执行记录。
  - Alternatives considered: compact single 缺少恢复日志，epic 对当前范围过重。
- **Problems encountered**:
  - Problem: 无。
  - Resolution: 无。
  - Retry count: 0
- **Validation**: `test -f .codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md && test -f .codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv && test -f .codex-tasks/20260417-admin-sidebar-grouping-hover-expand/PROGRESS.md` → pending manual run through file creation
- **Files changed**:
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md` — task scope and acceptance
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv` — execution milestones
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/PROGRESS.md` — recovery log
- **Next step**: Milestone 2 — Extend nav contract and menu definitions

---

## Milestone 2: Extend nav contract and menu definitions

- **Status**: DONE
- **Started**: 05:57
- **Completed**: 06:08
- **What was done**:
  - 为 `AdminNavItem` 增加 `groupLabelBefore`、`groupLabelBeforeKey`、`dividerBefore`。
  - 调整 global/workspace 菜单常量，接入 `Resources`、`Content Model`、`Website`、team divider。
  - 同步补齐 nav i18n key。
- **Key decisions**:
  - Decision: 使用“前置标记”而不是额外 section 数组。
  - Reasoning: favorites 是运行时注入，前置标记能最小化对现有菜单树和 active trail 的冲击。
  - Alternatives considered: 额外 `AdminNavSection[]` 会迫使 favorites 注入、header 命令源、nav utils 一起重写。
- **Problems encountered**:
  - Problem: `Content Model` 在 live repo 已有真实路由，与最初“占位项”假设冲突。
  - Resolution: 按 live repo truth 直接接入 `/content/models` 真实页面。
  - Retry count: 0
- **Validation**: `rg -n "groupLabelBefore|dividerBefore|NAV_RESOURCES|NAV_GROUP_WEBSITE|content.models" apps/admin/src apps/admin/test locales packages/ui/src` → exit 0
- **Files changed**:
  - `apps/admin/src/types/admin-nav.ts` — nav metadata contract
  - `apps/admin/src/constants/menu/global.ts` — resources placeholder entry
  - `apps/admin/src/constants/menu/workspaces.ts` — website block, content model, team divider
  - `locales/en-US/nav.json` — nav copy updates
  - `locales/zh-CN/nav.json` — nav copy updates
- **Next step**: Milestone 3 — Implement shared sidebar hover-expand state

---

## Milestone 3: Implement shared sidebar hover-expand state

- **Status**: DONE
- **Started**: 05:57
- **Completed**: 06:08
- **What was done**:
  - 在 `SidebarProvider` 中拆分 persistent open 与 desktop `hoverOpen`。
  - 为 desktop icon-collapsed sidebar 增加 enter/move 展开与 160ms leave 延迟收起。
  - 让 `state` 代表真实展示态，以便 tooltip、collapsible class 和 admin nav 自动切换。
- **Key decisions**:
  - Decision: hover preview 状态放进 shared sidebar context。
  - Reasoning: admin nav、tooltip、collapsed class 都已经依赖 `useSidebar().state`，共享层处理最干净。
  - Alternatives considered: shell-local hover 状态会把 shared tooltip/collapsible 逻辑拆裂。
- **Problems encountered**:
  - Problem: user-event hover 会在测试里先触发 sidebar container hover，旧 collapsed dropdown 用例全部失效。
  - Resolution: 按新交互契约更新相关测试，而不是绕过真实 hover 行为。
  - Retry count: 0
- **Validation**: `rg -n "hoverOpen|markHoverPointerEnter|markHoverPointerLeave|SIDEBAR_HOVER_CLOSE_DELAY_MS" packages/ui/src/sidebar.tsx apps/admin/src/components/layout` → exit 0
- **Files changed**:
  - `packages/ui/src/sidebar.tsx` — desktop hover preview state and delayed close
  - `apps/admin/src/components/layout/admin-side-nav/admin-sider-nav.tsx` — group marker rendering tied to presentation state
- **Next step**: Milestone 4 — Update rendering, i18n, and tests

---

## Milestone 4: Update rendering, i18n, and tests

- **Status**: DONE
- **Started**: 05:57
- **Completed**: 06:08
- **What was done**:
  - 新增 group marker label/divider 动画渲染。
  - 更新 layout/nav regression tests 到新的 IA 与 hover-expand 契约。
  - 修正 focused regression 集合，包含 global/workspace layout 与 nav regression。
- **Key decisions**:
  - Decision: 保留 collapsed dropdown 内部实现，但以 hover-expand 行为让它退出主路径。
  - Reasoning: 这样最小化代码删除面，同时新交互由 focused tests 锁住。
  - Alternatives considered: 直接删除 collapsed dropdown 组件会扩大 diff。
- **Problems encountered**:
  - Problem: 旧测试把 workspace IA 固定成 `content -> team -> workspace`，与新平铺 IA 冲突。
  - Resolution: 按新的 live contract 改写 `sidebar-route-state` 与 `workspace-nav-regression`。
  - Retry count: 1
- **Validation**: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/components/layout/admin-sidebar-shell.test.tsx test/layouts/global-layout.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0
- **Files changed**:
  - `apps/admin/test/components/layout/admin-side-nav.test.tsx`
  - `apps/admin/test/components/layout/admin-side-nav-spacing.test.tsx`
  - `apps/admin/test/components/layout/admin-sidebar-shell.test.tsx`
  - `apps/admin/test/layouts/global-layout.test.tsx`
  - `apps/admin/test/layouts/sidebar-route-state.test.tsx`
  - `apps/admin/test/lib/workspace-nav-regression.test.ts`
- **Next step**: Milestone 5 — Run final verification and close task

---

## Milestone 5: Run final verification and close task

- **Status**: DONE
- **Started**: 06:08
- **Completed**: 06:08
- **What was done**:
  - 复跑 focused final validation command。
  - 额外执行 `pnpm admin:check` 评估更大范围回归。
  - 记录 broad check 中与本任务无关的既有失败集合。
- **Key decisions**:
  - Decision: 用 focused final validation 作为任务完成门槛，同时报告 broader admin check 现状。
  - Reasoning: broad suite 含多组既有红灯，focused suite 才能真实反映本任务交付质量。
  - Alternatives considered: 仅报告 `admin:check` 失败会掩盖本任务已经验证通过的结果。
- **Problems encountered**:
  - Problem: `pnpm admin:check` 命中多组既有失败，其中只有 `workspace-nav-regression` 与本任务相关。
  - Resolution: 修复 `workspace-nav-regression` 后复跑 focused suite，全绿；其余失败保持显式暴露。
  - Retry count: 1
- **Validation**: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/components/layout/admin-sidebar-shell.test.tsx test/layouts/global-layout.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0
- **Files changed**:
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md` — final validation command updated
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv` — milestone statuses closed
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/PROGRESS.md` — recovery and validation log finalized
- **Next step**: None

---

## Final Summary

- **Total milestones**: 16
- **Completed**: 16
- **Failed + recovered**: 1
- **External unblock events**: 0
- **Total retries**: 2
- **Files created**: 3
- **Files modified**: 18
- **Key learnings**:
  - Shared sidebar state and admin nav rendering are tightly coupled through `useSidebar()`.
  - favorites runtime injection makes “前置标记”比 section arrays 更适合当前 sidebar IA。
  - Layout-sensitive consumers need a persistent layout-state contract when hover preview and persistent open can diverge.
- **Recommendations for future tasks**:
  - Keep hover-expand semantics inside shared sidebar primitives and let layout-sensitive consumers read `layoutState`.

---

## Follow-up Session: 2026-04-17 06:17

- **Status**: DONE
- **What was done**:
  - 将 global favorites 从“首项后插入”改成“按显式锚点插入”，满足 `Home -> Resources -> Favorites -> Workspaces` 的真实 IA，同时继续保持 favorites 属于运行时注入层。
  - 调整 `zh-CN` 导航产品文案：`Resources -> 模板库`、`Assets -> 素材库`、`Website -> 网站`、`Content Model -> 内容模型`。
  - 扩宽 collapsed divider，并为 group marker / nav button / sidebar 容器统一新的过渡曲线与时长。
  - 在 shared sidebar context 增加 `hoverIntent`，让 hover 延迟展开期间旧的 collapsed tooltip / children dropdown 退出主路径。
- **Key decisions**:
  - Decision: 使用 `insertStarredAfter` 作为 favorites 注入锚点，而不是把 favorites 重新塞回 global menu 常量。
  - Reasoning: 这保留了 base nav 与 runtime favorites 的边界，同时满足 global 菜单顺序诉求。
  - Decision: 将旧的 collapsed hover affordance 抑制逻辑放在 shared sidebar context。
  - Reasoning: hover threshold、tooltip 显隐、collapsed dropdown 退出主路径都依赖同一个 hover intent 源头，shared primitive 是根因位点。
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/components/layout/admin-sidebar-shell.test.tsx test/layouts/global-layout.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0, `7 passed`, `50 passed`
- **Files changed**:
  - `apps/admin/src/types/admin-nav.ts` — favorites 插入锚点 metadata
  - `apps/admin/src/constants/menu/global.ts` — global resources 锚点与 workspaces divider
  - `apps/admin/src/components/layout/admin-side-nav/admin-sider-nav.tsx` — group divider width、favorites 注入与 hover-intent-aware collapsed mode
  - `apps/admin/src/components/layout/admin-side-nav/nav-utils.ts` — collapsed divider / button left-anchor classes
  - `apps/admin/src/components/layout/admin-side-nav/nav-node-styles.ts` — slower text/layout easing for nav collapse
  - `packages/ui/src/sidebar.tsx` — hover enter delay, hover intent, slower left-anchored transitions, tooltip gating
  - `locales/zh-CN/nav.json` — Website / Content Model / Resources / Assets 产品化翻译
  - `apps/admin/test/components/layout/admin-side-nav.test.tsx` — explicit global favorites anchor regression
  - `apps/admin/test/components/layout/admin-side-nav-spacing.test.tsx` — collapsed divider width regression
  - `apps/admin/test/components/layout/admin-sidebar-shell.test.tsx` — hover threshold and quick-pass regressions

---

## Follow-up Session: 2026-04-17 06:34

- **Status**: DONE
- **What was done**:
  - 移除了 `packages/ui/src/sidebar.tsx` 中让 `sidebar-inner` 横向按内容收缩的 cross-axis 对齐 class，恢复菜单列的 full-width stretch。
  - 将 `AdminSiderNav` 的 `collapsedMode` 重新绑定到真实 `sidebarState === "collapsed"`，让 `Favorites` 在 hover threshold 期间继续走 collapsed contract。
  - 将旧 collapsed dropdown 的抑制范围缩到 `isCollapsed && !hoverIntent`，保证阈值期间不再出现 children 浮层，同时真实展开前也不提前切成 expanded inline 渲染。
  - 新增回归：锁住 favorites threshold contract 和 sidebar inner stretch contract。
- **Key decisions**:
  - Decision: 用 shared primitive 修 `sidebar-inner` stretch，而不是在 menu rows 上继续叠局部宽度补丁。
  - Reasoning: 这次宽度漂移同时影响 group marker、divider 和菜单项，真正的 cross-axis owner 在 shared sidebar primitive。
  - Decision: 让 `hoverIntent` 只负责抑制 tooltip / dropdown 路径，不参与 `collapsedMode` 的 presentation 判定。
  - Reasoning: 阈值期间 UI 仍处于 collapsed presentation，`Favorites` 这种分支渲染必须继续读 presentation state 才稳定。
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/components/layout/admin-sidebar-shell.test.tsx test/layouts/global-layout.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0, `7 passed`, `52 passed`
- **Files changed**:
  - `packages/ui/src/sidebar.tsx` — restored stretch layout for sidebar inner
  - `apps/admin/src/components/layout/admin-side-nav/admin-sider-nav.tsx` — restored collapsed presentation ownership and full-width group marker
  - `apps/admin/test/components/layout/admin-side-nav.test.tsx` — favorites hover-threshold regression
  - `apps/admin/test/components/layout/admin-side-nav-spacing.test.tsx` — sidebar-inner stretch regression

---

## Follow-up Session: 2026-04-17 06:44

- **Status**: DONE
- **What was done**:
  - 读取 repo root `DESIGN.md` motion section，按 design-system truth 回收 timing 与 easing。
  - 将 shared sidebar 的 hover-open / hover-close delay 调整为 `110ms / 180ms`。
  - 将 sidebar container 与 menu button 的 easing 改成 `cubic-bezier(0.4, 0, 0.2, 1)`，与 `DESIGN.md` 的 `Transition` 一致。
  - 移除 collapsed button 上最容易制造视觉跳点的 `size/padding/margin` 动画路径，改成保持 full-width button、只缩右侧 padding。
  - 将 label hide/show 改成 `max-width + opacity + translate`，让展开时看起来更像连续补间，而不是按钮尺寸和文字同时跳位。
- **Key decisions**:
  - Decision: motion curve 优先跟 `DESIGN.md` 的系统级定义对齐，而不是继续沿用前一轮临时调出来的自定义 bezier。
  - Reasoning: 这次用户已经明确点名 design truth，当前 `Transition` curve 也更适合 sidebar 这类状态切换。
  - Decision: collapsed icon rail 的平滑优先级高于“按钮本身在 collapsed 态缩成一个更小尺寸”。
  - Reasoning: 真正的卡顿来自按钮在 sidebar 宽度动画期间还同步切 `width/padding/margin`，把这层变化拿掉后，视觉连续性更稳定。
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/components/layout/admin-sidebar-shell.test.tsx test/layouts/global-layout.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0, `7 passed`, `52 passed`
- **Files changed**:
  - `DESIGN.md` — consulted for motion durations and easing
  - `packages/ui/src/sidebar.tsx` — shorter hover threshold and design-system transition curve
  - `apps/admin/src/components/layout/admin-side-nav/nav-node-styles.ts` — content motion changed to opacity/translate with design-system curve
  - `apps/admin/src/components/layout/admin-side-nav/nav-utils.ts` — collapsed button contract simplified
  - `apps/admin/src/components/layout/admin-side-nav/nav-icon-slot.tsx` — icon motion aligned to design-system curve
  - `apps/admin/test/components/layout/admin-sidebar-shell.test.tsx` — updated hover timing regression
  - `apps/admin/test/components/layout/admin-side-nav.test.tsx` — updated favorites threshold regression
  - `apps/admin/test/components/layout/admin-side-nav-spacing.test.tsx` — updated collapsed button contract regression

---

## Follow-up Session: 2026-04-17 06:56

- **Status**: DONE
- **What was done**:
  - 将 `packages/ui/src/sidebar.tsx` 的 desktop sidebar contract 拆成 `layoutState` 与视觉 `state`：`sidebar-gap` 和 `data-collapsible` 继续跟持久布局态绑定，hover preview 只驱动 `sidebar-container` 的宽度展开。
  - 为 desktop sidebar root 增加 `data-layout-state`，并把 `SidebarInset` 的 inset margin selector 切到 `peer-data-[layout-state=collapsed]`，保持 hover preview 期间主体布局稳定。
  - 将 `apps/admin/src/pages/workspaces/content/library/page.tsx` 的 preview auto-collapse 判定切到 `sidebar.layoutState`，避免 hover preview 被误读成真实展开。
  - 调整 collapsed nav button contract 为对称 padding + centered geometry，修复 icon mode 下的视觉偏移。
  - 补充 focused regressions：shell test 锁定 hover preview 期间 `data-layout-state=collapsed`，route-state probe 暴露 `layoutState`，spacing test 锁定 collapsed padding contract。
- **Key decisions**:
  - Decision: 保留 `state` 作为视觉展开态，同时新增 `layoutState` 作为持久布局态。
  - Reasoning: 现有 Admin nav、tooltip、account menu 都需要继续读取视觉展开态；layout-sensitive 逻辑则需要稳定读取持久布局态。
  - Decision: overlay preview 通过取消 icon-width override 来恢复 full sidebar width，而不是改动 `sidebar-gap`。
  - Reasoning: desktop 页面内容稳定性的 owner 是 gap 占位宽度；让 gap 保持 collapsed，preview 容器自身扩张即可满足 overlay 行为。
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/components/layout/admin-sidebar-shell.test.tsx test/layouts/global-layout.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0, `7 passed`, `52 passed`
- **Files changed**:
  - `packages/ui/src/sidebar.tsx` — split layout state from visual state and made hover preview overlay-only
  - `apps/admin/src/pages/workspaces/content/library/page.tsx` — switched preview collapse logic to persistent layout state
  - `apps/admin/src/components/layout/admin-side-nav/nav-utils.ts` — centered collapsed icon geometry
  - `apps/admin/test/components/layout/admin-sidebar-shell.test.tsx` — overlay hover-preview regression
  - `apps/admin/test/components/layout/admin-side-nav-spacing.test.tsx` — collapsed icon-centering regression
  - `apps/admin/test/layouts/sidebar-route-state.test.tsx` — layout-state probe coverage
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md` — follow-up scope and acceptance updates
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv` — milestones 13-16 closed
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/PROGRESS.md` — recovery log updated
