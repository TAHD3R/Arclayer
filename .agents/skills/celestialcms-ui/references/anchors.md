# 同 Feel 锚点（不要“凭空发明”）

这些文件共同定义了你想要复现的 Feel。做新 UI 时先读它们，再输出“风格锁定声明”。

## 锚点列表（Admin）

1) `apps/admin/src/pages/workspaces/settings/workspace/basics/page.tsx`
2) `apps/admin/src/pages/workspaces/assets/page.tsx`
3) `apps/admin/src/pages/workspaces/team/roles/page.tsx`
4) `apps/admin/src/pages/workspaces/team/shared/components/invite-members-dialog.tsx`

## 每个锚点要学什么

### Workspace basics（设置页骨架）
- `DefaultPage` + `ContentGuard` 的状态组合（loadingVariant、retry）
- 设置页的“固定宽 + 表单节奏 + 分组面板”组织方式

### Assets（列表页骨架 + overlays）
- 顶部 action（primary CTA + icon + `autoInsertSpace={false}`）
- `extra` 区承载工具条（搜索/筛选/更多）
- 页面主体与 overlays 分离（view + overlays + section）

### Team roles（数据密度与可读性）
- fixed 宽页面内的“高密度表格/粘性表头/横向滚动”处理
- 搜索输入放在 body 顶部，节奏清晰（`gap-4`）

注意：
- 该页面存在 `Spin` 使用；新增 overlay 内 loading 指示应遵守设计指南（优先 LoaderOne/标准 skeleton），不要把 `Spin` 当作 overlay 默认。

### Invite members dialog（SettingDialog 语法）
- `SettingDialog` 的 title+description 契约
- body 的 `grid gap-4 py-2` + 字段块 `grid gap-1.5`
- footer 的动作语义：cancel text / confirm primary + loading
- Select/Dropdown 使用 overlay 内 popup container 策略（避免 Radix overlay 阻断点击）
