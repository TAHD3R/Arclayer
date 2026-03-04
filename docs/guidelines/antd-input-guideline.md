# Antd Input 使用分类指南（Admin）

目标：在不强行“一刀切”的前提下，为项目中的 Antd `Input` 选择一致的 `size` / `variant` 组合，让**信息层级（prominence）**与**页面密度（density）**保持稳定。

> 本指南覆盖：`Input` / `Input.Password` / `Input.TextArea` / `Input.Search`（如使用）。

---

## 1) 决策维度（先看语义，再看组件）

判断一个输入框该用什么配置，优先看它的“语义角色”：

1. **主流程表单字段（Primary form field）**
   例如：登录/注册/邀请加入/引导流程中，用户必须完成的字段。
2. **查询/筛选/定位输入（Query input）**
   例如：页面工具栏搜索、侧边栏筛选搜索、弹层/Popover 内的搜索。
3. **设置/编辑表单字段（Settings form field）**
   例如：设置页/对话框内的字段，数量较多、标签+帮助文本齐全、强调可读性与对齐。
4. **高密度/技术型输入（Dense / technical）**
   例如：编辑器 inspector、表格行内、紧凑列表；密度优先于“好看”。

---

## 2) 推荐预设（可直接落地）

### A. 主流程表单（推荐：`size="large" variant="filled"`）

适用场景：

- 登录 / 注册 / 邀请加入 / setup wizard 等“主流程、单列表单”
- 页面视觉期望“更柔和、更现代”，且字段数量不多

理由：

- `large` 提升命中面积与节奏一致性（通常与 `Button size="large"` 配套）
- `filled` 在主流程更像产品化表单，而不是“后台配置项”

示例（参考现有用法）：

```tsx
<Input size="large" variant="filled" />
<Input.Password size="large" variant="filled" />
```

---

### B. 查询/筛选输入（推荐：`variant="filled"`，不提供 `size`）

适用场景：

- `DefaultPage` 的 `extra`/toolbar 区域搜索框
- 侧边栏筛选中的搜索框
- Popover/Sheet 中的“快速搜索”

理由：

- `filled` 与工具栏背景更融合，视觉上更像“工具控件”
- 默认 size 保持工具栏高度更紧凑，避免把 toolbar 撑高

建议搭配：

- `allowClear`
- `prefix={<Search ... />}`（语义明确且占用小）

示例：

```tsx
<Input variant="filled" allowClear prefix={<Search className="size-4 text-label-secondary" />} />
```

---

### C. 设置/编辑表单字段（推荐：`size="large"`，不提供 `variant`）

适用场景：

- 设置页表单字段（字段多、标签/帮助齐全）
- `SettingDialog` / `Sheet` 内的表单字段（非查询类）
- 危险操作确认（输入确认文本/名称）

理由：

- `large` 保持表单节奏与可点击性
- 默认 outlined 更“配置项感”，在设置页不会与周围卡片/边框产生过强的底色叠加

示例：

```tsx
<Input size="large" />
<Input.Password size="large" />
<Input.TextArea rows={4} />
```

---

### D. 高密度/技术型输入（推荐：保持默认；必要时使用 `size="small"`）

适用场景：

- 编辑器 inspector 面板（大量字段、密度高）
- 表格行内编辑、非常窄的布局

理由：

- 避免 `large`/`filled` 引入不必要的高度与底色，从而破坏对齐/密度

示例：

```tsx
<Input />
<Input size="small" />
```

---

## 3) 快速判断表（从上到下匹配）

| 你在做什么输入？ | 推荐 `size` | 推荐 `variant` |
|---|---:|---:|
| 登录/注册/邀请加入等主流程表单字段 | `large` | `filled` |
| 工具栏/侧栏/Popover 的搜索/筛选输入 | *(默认)* | `filled` |
| 设置页/SettingDialog 的表单字段（非查询） | `large` | *(默认)* |
| 编辑器 inspector/表格行内/高密度场景 | *(默认 or small)* | *(默认)* |

---

## 4) 统一性约束（避免页面内混用）

- 同一个“表单组”（同一对话框/同一面板/同一行工具栏）里，尽量不要混用 `filled` 与默认 outlined，除非该输入的语义角色不同（例如：表单字段 + 旁边的工具栏搜索）。
- 同一行若搭配 `Button size="large"`，优先让该行主输入也为 `size="large"`（否则高度会显得“不齐”）。
