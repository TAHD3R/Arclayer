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

- **Current milestone**: `#38 — Commit the follow-up changes`
- **Current status**: `IN_PROGRESS`
- **Last completed**: `#37 — Evaluate menu constant consolidation outcome`
- **Current artifact**: `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv`
- **Key context**: 当前 shared/admin contract 已经对齐到用户最新要求：`layoutState` 持续保持 collapsed，collapsed tooltip/popover 主路径已清掉，hover preview 继续是 overlay-only 且恢复完整交互，同时 hover preview 期间不再额外添加圆角、边框、阴影，外观直接复用正常展开态。
- **Key context**: 浏览器实测已经补齐，并确认上一版实现仍有真实布局 bug：虽然 `sidebar-container` 是 fixed，但根节点 `[data-slot="sidebar"]` 自身因为没有命中 collapsed width contract，仍保持 270px 宽度，导致 `main` 被挤压。当前修复把布局宽度 owner 明确放回 root sidebar 本身，collapsed hover preview 只放大 fixed container。
- **Known issues**: 更大范围的 `pnpm admin:check` 仍有与本任务无关的既有失败，集中在 `usercenter-overlay-host.test.tsx`、`assets-page-view.test.tsx`、`tooltip-content-sync.test.tsx`。
- **Next action**: 提交当前 follow-up 变更。

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

---

## Follow-up Session: 2026-04-17 09:07

- **Status**: DONE
- **What was done**:
  - 按最新设计合同回收 hover preview 的专属浮层皮肤，删除 `packages/ui/src/sidebar.tsx` 里只在 preview 阶段添加的圆角、边框和阴影。
  - 保留 shared sidebar 的 overlay-only 行为合同：`layoutState` 继续保持 collapsed，`data-hover-preview` 继续标记临时展开态，preview 展开后菜单继续恢复正常交互。
  - 更新 `admin-sidebar-shell` focused regression，把断言从“有 rounded/shadow”改成“外观与正常展开态一致，同时布局仍保持 collapsed”。
- **Key decisions**:
  - Decision: 只改 shared sidebar owner，不在 admin shell 或页面层追加外观补丁。
  - Reasoning: 用户要求的是布局行为修正，shared `sidebar-inner` 才是 hover preview 皮肤的根因位点。
  - Decision: 保留 overlay preview 的 `z` 层级和交互恢复合同，仅移除额外装饰类。
  - Reasoning: 这样可以继续满足“覆盖内容区、不影响主体宽度、hover 展开后可点击”的完整行为，同时让视觉完全回到正常展开态。
- **Validation**:
  - `test -f .codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md && rg -n "overlay behavior|normal expanded sidebar appearance|外观与正常展开态一致" .codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md` → exit 0
  - `rg -n "data-hover-preview|rounded-r-xl|shadow-2xl|inert=|state === \"collapsed\"" packages/ui/src/sidebar.tsx apps/admin/src/components/layout/admin-sidebar-shell.tsx` → exit 0
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/components/layout/admin-sidebar-shell.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0, `6 files`, `47 tests`
- **Files changed**:
  - `packages/ui/src/sidebar.tsx` — removed hover-preview-only visual chrome while keeping overlay behavior
  - `apps/admin/test/components/layout/admin-sidebar-shell.test.tsx` — locked the behavior-only overlay contract
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md` — clarified the no-extra-chrome contract
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv` — recorded steps 27-29
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/PROGRESS.md` — recovery block and follow-up log updated

---

## Follow-up Session: 2026-04-17 09:18

- **Status**: DONE
- **What was done**:
  - 用 Playwright 直接登录并打开 `http://localhost:5174/w/XTrNArxR3vwWh4QlEyh9zQ`，真实复现了用户反馈的 layout shift。
  - 在浏览器里读取 `[data-slot="sidebar"]`、`[data-slot="sidebar-gap"]`、`[data-slot="sidebar-container"]`、`[data-slot="sidebar-inset"]` 的运行态矩形，确认 bug 根因在 root sidebar 宽度 owner。
  - 修复 `packages/ui/src/sidebar.tsx`：让 root sidebar 自己使用 `data-[layout-collapsible=...]` 宽度 contract，而不是错误地在 root 自身上写 `group-data-[layout-collapsible=...]`。
  - 复跑 focused Vitest，并再次用 Playwright 量测前后尺寸和截图验证 overlay-only 行为。
- **Key decisions**:
  - Decision: 根因修在 shared sidebar root，而不是继续调整 fixed container 或页面布局壳层。
  - Reasoning: Playwright 证据显示容器是对的，真正挤占布局的是 root flex item 仍保持 expanded width。
  - Decision: 用 root 自匹配 `data-[layout-collapsible=...]` 选择器替换 `group-data-[layout-collapsible=...]`。
  - Reasoning: `group-data-*` 在 root 自身上不会命中，所以类名存在但 contract 从未生效。
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-sidebar-shell.test.tsx test/layouts/sidebar-route-state.test.tsx test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0, `6 files`, `47 tests`
  - Playwright pre-fix evidence:
    - collapsed: `sidebar.width=270`, `main.left=270`, `main.width=510`
    - hover preview: `container.width=270`, `main.left=270`
  - Playwright post-fix evidence:
    - collapsed: `sidebar.width=56`, `main.left=56`, `main.width=724`
    - hover preview: `sidebar.width=56`, `container.width=270`, `main.left=56`, `main.width=724`
  - Browser artifacts:
    - `admin-sidebar-hover-preview-runtime.png` — pre-fix squeezed layout
    - `admin-sidebar-hover-preview-fixed.png` — post-fix overlay-only hover preview
- **Files changed**:
  - `packages/ui/src/sidebar.tsx` — root sidebar width owner fixed with self data selectors
  - `apps/admin/test/components/layout/admin-sidebar-shell.test.tsx` — updated width-contract assertions
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv` — recorded steps 30-32
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/PROGRESS.md` — recorded Playwright root-cause evidence and fix validation
  - `apps/admin/test/components/layout/admin-side-nav-spacing.test.tsx` — updated collapsed button contract regression

---

## Follow-up Session: 2026-04-17 09:37

- **Status**: IN_PROGRESS
- **What was done**:
  - 根据用户最新澄清更新 task scope：Help Center 入口挂到 `apps/admin/src/components/layout/admin-topbar.tsx` 通知按钮右侧，不再考虑 Content Models 页面 header 方案。
  - 重新审计 live owner，确认 `apps/admin/src/constants/menu/usercenter.ts` 当前没有任何引用，`apps/admin/src/constants/menu/common.ts` 只通过 `admin-layout.tsx` / `global-layout.tsx` 传入 footerItems。
  - 确认 collapsed 直点问题的根因仍在 `apps/admin/src/components/layout/admin-sidebar-shell.tsx`：真正 collapsed 时给 `SidebarContent` 挂了 `inert` 和 `aria-hidden`，整列菜单都失去点击能力。
  - 记录本轮 TODO：收紧 hover-open delay、恢复 collapsed 直点、移除 footer/common 菜单链、在 topbar 加 Help Center 占位按钮，并在代码落地后重新评估 `global.ts` / `workspaces.ts` 是否值得合并。
- **Key decisions**:
  - Decision: 先做 shared/layout 根因修复，再决定菜单常量是否收敛。
  - Reasoning: 当前真正影响交互的是 shared sidebar 与 layout/footer owner，先把用户明确点名的行为问题修好更稳。
  - Decision: Help Center 当前只做无事件占位按钮，复用 topbar icon-button contract。
  - Reasoning: 用户已经明确功能后补，当前需要的是入口位置和布局结构对齐。
- **Validation**:
  - `rg -n "buildCommonFooterItems|COMMON_FOOTER_NAV_ITEMS|footerItems|help-center|usercenter" apps/admin/src/layouts apps/admin/src/constants/menu apps/admin/src/components/layout` → exit 0
  - `test -f .codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md && rg -n "topbar|help-center|collapsed 直点|hover-open 阈值|footer" .codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md .codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv` → exit 0
- **Files changed**:
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/SPEC.md` — added the new follow-up goals and acceptance criteria
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv` — recorded steps 33-38 for this follow-up
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/PROGRESS.md` — updated recovery block and logged the new session

---

## Follow-up Session: 2026-04-17 09:44

- **Status**: DONE
- **What was done**:
  - 将 `packages/ui/src/sidebar.tsx` 的 hover-open delay 从 `110ms` 收紧到 `70ms`，保留 `180ms` leave delay。
  - 在 `apps/admin/src/components/layout/admin-sidebar-shell.tsx` 删除真正 collapsed 态下的 `SidebarContent inert/aria-hidden` 阻断，并顺手收掉已经无用的 footer menu 渲染分支。
  - 删除 `apps/admin/src/constants/menu/common.ts` 与 `apps/admin/src/constants/menu/usercenter.ts`，同时把 `AdminSceneLayout` / `AdminSidebarShell` / `admin-layout.tsx` / `global-layout.tsx` 的 `footerItems` 合同一起移除。
  - 在 `apps/admin/src/components/layout/admin-topbar.tsx` 给通知按钮右侧新增 Help Center 无事件占位按钮，沿用现有 topbar icon-button 和 tooltip 合同。
  - 更新 focused tests，并用 Playwright 在真实页面验证 hover 节奏、overlay-only layout、collapsed 直点与 topbar 按钮位置。
- **Key decisions**:
  - Decision: collapsed 直点问题直接修在 `admin-sidebar-shell` 的 inert owner。
  - Reasoning: 当前 tooltip/popover 分支已经退出主路径，真正挡住点击的是 shared sidebar content 被整体 inert。
  - Decision: footer/common 菜单链做完整删除，而不是传空数组保留壳层。
  - Reasoning: 这轮需求已经把 Help Center 入口收敛到 topbar，保留 footerItems 只会继续维持一个空 contract。
  - Decision: `global.ts` 和 `workspaces.ts` 继续分文件管理。
  - Reasoning: 它们对应不同导航域和不同 runtime 映射 contract，这轮 follow-up 聚焦交互与 layout owner，保持窄变更更稳。
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-sidebar-shell.test.tsx test/components/layout/topbar-sidebar-toggle-icon.test.tsx test/layouts/global-layout.test.tsx test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts` → exit 0, `8 files`, `66 tests`
  - Playwright on `http://localhost:5174/w/XTrNArxR3vwWh4QlEyh9zQ/content/models` with collapsed sidebar:
    - hover 40ms: `data-state=collapsed`, `main.left=56`, `main.width=724`
    - hover 90ms: `data-state=expanded`, `main.left=56`, `main.width=724`
    - direct click on `Assets` from collapsed mode navigated to `/w/XTrNArxR3vwWh4QlEyh9zQ/assets`
    - topbar snapshot showed `Open notification center -> Help center -> account menu`
- **Files changed**:
  - `packages/ui/src/sidebar.tsx` — shorter hover-open threshold
  - `apps/admin/src/components/layout/admin-sidebar-shell.tsx` — removed collapsed inert gating and footer menu branch
  - `apps/admin/src/components/layout/admin-topbar.tsx` — added Help Center placeholder button
  - `apps/admin/src/layouts/admin-scene-layout.tsx` — removed footerItems contract
  - `apps/admin/src/layouts/admin-layout.tsx` — removed common footer wiring
  - `apps/admin/src/layouts/global-layout.tsx` — removed common footer wiring
  - `apps/admin/src/layouts/admin-scene-utils.ts` — removed buildCommonFooterItems helper
  - `apps/admin/src/constants/menu/common.ts` — deleted deprecated footer menu definition
  - `apps/admin/src/constants/menu/usercenter.ts` — deleted unused menu definition
  - `apps/admin/test/components/layout/admin-sidebar-shell.test.tsx` — updated hover timing and collapsed interaction regressions
  - `apps/admin/test/components/layout/topbar-sidebar-toggle-icon.test.tsx` — added Help Center topbar placement regression
  - `apps/admin/test/components/layout/admin-side-nav.test.tsx` — updated favorites hover-threshold regression
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/TODO.csv` — closed steps 34-37 and reopened commit step
  - `.codex-tasks/20260417-admin-sidebar-grouping-hover-expand/PROGRESS.md` — recorded implementation and validation evidence

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
