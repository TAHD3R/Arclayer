# Task Specification

> Scope anchor for the task. Update only when goals or constraints change, and log the reason in PROGRESS.md.

## Task Shape

- **Shape**: `single-full`

## Goals

- 为 admin sidebar 菜单定义增加分组标签与分割线能力，并在 global/workspace 菜单中接入新的 IA 结构。
- 为 global 菜单增加 `Resources` 占位菜单项，并在 workspace 菜单中增加 `Content Model` 占位菜单项。
- 将桌面端 icon-collapsed sidebar 从 rail click toggle 升级为“收起态 hover 整栏展开，离开后短延迟收起”。
- 让 collapsed group hover dropdown 在临时 hover 展开期间退出，只保留展开态下的 click-to-expand 子树行为。
- 让桌面端 collapsed hover preview 以 overlay 方式展开，不改变主体内容区的布局宽度。
- 修复 collapsed icon mode 的按钮 padding 几何，让图标在折叠态保持居中。
- 当前 follow-up 只复刻参考实现的 section marker / divider 展开折叠样式，不调整其他 sidebar 行为。
- 最新 follow-up 还要修正 section marker 的同步 reveal 节奏，以及 collapsed leaf/group 顶层按钮的左锚点收拢一致性，并重新确认 overlay hover-preview contract 仍然成立。
- 最新 follow-up 还要让 collapsed hover preview 只改变 overlay 行为，不新增任何浮层皮肤，并移除 collapsed 态下依赖 tooltip / popover 的菜单交互。
- 最新 follow-up 还要缩短 hover-open 阈值、恢复 collapsed 直点交互、移除 sidebar footer help-center 注入，并把 help-center 占位入口收敛到 topbar 通知按钮右侧。

## Non-Goals

- 不实现 `Resources` 或 `Content Model` 的真实页面与路由。
- 不改动 mobile sidebar 行为。
- 不重做 favorites 信息架构，只在现有注入顺序上对齐新的分组/分割线语义。
- 不改变点击 rail / 快捷键触发的持久展开语义；持久展开继续保留布局占位。
- 不修改字体样式。
- 不修改 sidebar 宽度动画、menu padding、按钮动效或其他非 marker 部分。
- 不重做菜单信息架构；当前 follow-up 只收敛样式 owner、动效节奏和 shared/admin motion contract。
- 不新增第二套 collapsed 菜单交互；hover preview 展开后的 expanded tree 是唯一交互路径。
- 不为 hover preview 额外添加圆角、边框、阴影或其他视觉装饰；外观与正常展开态保持一致。

## Constraints

- 遵循 repo-local `arclayer-frontend-design` 与 `karpathy-guidelines`。
- 共享状态改动应落在 `packages/ui/src/sidebar.tsx`，避免页面层补丁。
- 保持 i18n 完整，新增 nav key 需要同时补 `en-US` 与 `zh-CN`。
- 验证优先使用 `pnpm -C apps/admin exec vitest run --config vitest.config.ts ...` 的定向测试链路。
- `useSidebar()` 需要区分持久布局态与视觉展开态，避免 hover preview 被布局逻辑误读。
- 本轮窄改动只允许触达 `apps/admin/src/components/layout/admin-side-nav/admin-sider-nav.tsx` 中的 section marker owner，以及对应的 focused spacing regression。
- 最新 follow-up 允许触达 `packages/ui/src/sidebar.tsx` 和 admin side-nav motion 常量，因为左锚点与 overlay 观感问题来自 shared/admin 双层 contract。
- 最新 follow-up 允许触达 `favorites-node.tsx`、`node-expanded-group.tsx` 与 admin shell，因为 collapsed tooltip/popover 分支分散在这些 shared/admin owner 中。
- 最新 follow-up 继续允许触达 `packages/ui/src/sidebar.tsx` 和 focused tests，因为“overlay 行为保持、外观不变”的根因仍在 shared sidebar container/inner owner。
- 最新 follow-up 允许触达 `admin-topbar.tsx`、`admin-scene-layout.tsx`、`admin-layout.tsx`、`global-layout.tsx` 与菜单常量，因为顶部 help-center 入口与 footer 菜单删除需要在 shared layout owner 收口。

## Environment

- **Project root**: `/home/philip/arclayer-refactor`
- **Language/runtime**: `TypeScript / React / Vite`
- **Package manager**: `pnpm`
- **Test framework**: `Vitest + Testing Library`
- **Build command**: `pnpm admin:check`
- **Existing test count**: `3 focused sidebar test files already identified`

## Risk Assessment

- [x] External dependencies (APIs, services) — availability confirmed?
- [x] Breaking changes to existing code — impact assessed?
- [x] Large file generation — disk space sufficient?
- [x] Long-running tests — timeout configured?

## Deliverables

- `AdminNavItem` contract 扩展为支持前置分组标签与分割线。
- `apps/admin/src/constants/menu/global.ts` 与 `apps/admin/src/constants/menu/workspaces.ts` 完成新的 sidebar IA 定义。
- `packages/ui/src/sidebar.tsx` 支持桌面端 hover 临时展开态。
- admin sidebar 渲染层支持展开态标签 / 收起态 divider 的动画切换。
- `packages/ui/src/sidebar.tsx` 将 hover preview 从 layout width 中剥离，提供 overlay-only desktop preview。
- admin collapsed icon button 在 icon mode 下使用对称 padding contract。
- section marker 在展开/折叠态的 spacing 和 divider reveal 对齐参考实现，同时保留当前项目的字体 contract。
- 相关 i18n 与测试更新。
- section marker 在 collapsed 态与 divider 共享同构 owner，line/text 以同一节奏切换。
- collapsed leaf/group 顶层按钮共享稳定的左锚点收拢路径，hover preview 期间不再出现 icon snap-back 观感。
- collapsed hover preview 在行为上覆盖内容区而不影响布局宽度，同时继续复用正常展开态视觉外观。
- collapsed 态下的 sidebar 菜单内容整体 inert，leaf/group/favorites 不再通过 tooltip 或 popover 承担主交互。
- hover-open 阈值收紧到“有意停留即展开、快速划过保持安静”的节奏。
- collapsed 态下图标菜单支持直接点击，无需等待 hover preview 展开。
- `common.ts`、`usercenter.ts` 与 sidebar footer help-center 注入链被移除。
- admin topbar 在通知按钮右侧渲染 Help Center 占位按钮。

## Done-When

- [ ] global sidebar 呈现 `Home -> Favorites -> divider -> Resources -> Workspaces -> Maintenance` 的 leading section 结构。
- [ ] workspace sidebar 呈现 `Overview -> Favorites -> Website -> Assets -> Contents Library -> Content Model -> Site Settings -> divider -> Team -> Workspace`。
- [ ] 桌面端收起 sidebar 在 hover 时展开，离开 sidebar 容器后短延迟收起。
- [ ] 临时 hover 展开期间不再显示 collapsed children dropdown，子树只通过点击展开。
- [ ] 桌面端 collapsed hover preview 不再挤占主体内容宽度，主区域保持稳定。
- [ ] layout-sensitive consumer 读取持久布局态，不把 hover preview 误认成真实展开。
- [ ] 折叠态 icon button 保持左右对称，图标视觉居中。
- [ ] 仅 section marker / divider 展开折叠样式变化，其他 sidebar contract 保持不变。
- [ ] section marker 在 collapsed 态与 divider 完全同构，并在 expanded 态同步 reveal label。
- [ ] collapsed leaf/group 顶层按钮的 icon、label、chevron 收拢路径稳定锚定左侧。
- [ ] focused suite 继续证明 hover preview 仍是 overlay-only，layout gap 继续保持 collapsed。
- [ ] collapsed hover preview 覆盖在内容区上方，主体宽度保持稳定，同时侧边栏外观与正常展开态一致。
- [ ] collapsed 态下不再出现菜单 tooltip、group popover、favorites popover 或 rail tooltip。
- [ ] hover-open 延迟收紧后，快速划过仍保持 collapsed，有意停留时接近无感展开。
- [ ] collapsed 态下可以直接点击 leaf 菜单进行跳转。
- [ ] admin sidebar footer 不再保留 common/help-center 预留区域。
- [ ] admin topbar 在通知按钮右侧显示 Help Center 占位按钮。
- [ ] 定向 vitest 全绿。

## Final Validation Command

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-spacing.test.tsx test/components/layout/admin-sidebar-shell.test.tsx test/layouts/global-layout.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/i18n/common-sidebar-tooltip-i18n.test.ts test/lib/workspace-nav-regression.test.ts
```

## Demo Flow (optional)

1. 打开 admin 桌面端页面并保持 sidebar 为收起态。
2. 指针移入 sidebar 容器，确认整栏以 overlay 方式展开、group label 以文本显示、主体宽度保持不变。
3. 指针移出 sidebar，确认在短延迟后收起，group label 切换为 divider。
4. 查看折叠态 icon button，确认图标居中。
5. 查看 global/workspace 菜单顺序，确认占位项与分割线位置正确。
6. 在 collapsed 态直接点击一个 leaf icon，确认可以直接进入目标路由。
7. 查看顶栏通知按钮右侧，确认 Help Center 占位按钮存在，且 sidebar footer 没有额外保留区域。
