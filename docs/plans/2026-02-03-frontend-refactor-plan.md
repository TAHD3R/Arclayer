# 前端重构收敛计划（Admin）

日期：2026-02-03
范围：`apps/web/admin`
目标：在不改动业务逻辑的前提下，统一目录结构、命名规范、组件库组织、类型/常量/工具归档，并形成后续 portal 对齐的金标准。

---

## 1. 背景与问题

当前 admin 前端存在以下结构性问题：

- routes 与 views 混用，页面入口不唯一，导致维护成本上升。
- `components/animate-ui` 与 `components/ui` 重复且层级过深。
- `components/app` 与 `customized/table` 目录划分不清晰。
- 命名风格混乱（camelCase / PascalCase / kebab-case 混用）。
- 类型、常量、工具方法散落各处，缺乏统一归档与更新机制。
- 测试文件零散分布，不利于维护。

本次重构以“结构收敛 + 命名统一 + 组件库扁平化”为主轴，不改变业务逻辑与功能行为。

---

## 2. 目标与非目标

### 2.1 目标

- routes 作为唯一页面入口，views 仅作为迁移来源，迁移完成后删除目录。
- UI 组件统一归档至 `src/components/ui`，重复组件保留 animate-ui 实现。
- 项目级组件重组为 `src/components/common` 与 `src/components/data-table`。
- 文件与目录命名统一为 kebab-case，React 组件名统一为 PascalCase。
- `src/api/*` 文件名统一 kebab-case，与 URL 路径风格一致。
- admin 内部类型统一收敛到 `src/types`，共用类型抽离到 `packages/web-types`。
- 测试文件路径镜像化，便于维护与定位。

### 2.2 非目标

- 不修改功能逻辑或接口行为。
- 不手动维护后端相关类型（未来由 OpenAPI Generator 接管）。
- 不在本轮改动中调整 portal 端结构。

---

## 3. 目标目录结构

```
apps/web/admin/src
├── routes/                  # TanStack 路由入口（仅装配）
├── pages/                   # 页面组件（与 routes 解耦）
│   └── **/page.tsx
├── components/
│   ├── ui/                   # 通用 UI 组件（扁平化）
│   ├── common/               # 项目级二次封装
│   └── data-table/           # 表格体系与 hooks
├── lib/                      # 工具与基础能力
├── constants/                # 常量归档
├── types/                    # admin 内部类型
└── ...

packages/web-types            # admin/portal 共用类型
```

---

## 4. 路由与视图收敛策略

- `routes` 为唯一页面入口，路由文件负责装配与 lazy/suspense。
- `views` 中的页面级组件迁入 `src/pages/**/page.tsx`，routes 只负责引用 pages。
- `views` 中的可复用子组件、特定领域工具可迁移至：
  - `components/common`（通用 UI + 业务封装）
  - `components/data-table`（表格体系）
  - `lib` 或 `types`（纯逻辑/类型）
- 迁移完成后，不再直接从 `views` 引用页面级组件，并删除 `views` 目录。

---

## 5. UI 扁平化与去重规则

- `components/animate-ui` 与 `components/ui` 所有通用组件统一迁入 `components/ui`。
- 若 `components/ui` 与 `components/animate-ui/*/*` 存在同名组件，保留 animate-ui 版本并替换其余引用。
- `components/ui` 允许保留子目录：`icons/`、`file-icons/`。
- 禁止出现 `primitives/components` 多层嵌套结构。

---

## 6. 项目组件与表格体系重组

- `components/app` → `components/common`
- `components/customized/table` → `components/data-table`
- `useDataTable*` 与表格相关 types/props 同步迁移到 `components/data-table`。
- 封装的 dialog/sheet 组件按以下规则归属：
  - 可复用基础 UI：`components/ui`
  - 业务封装组件：`components/common`

---

## 7. 命名与文件规范

- **文件/目录**：统一 kebab-case。
- **React 组件**：统一 PascalCase。
- **逻辑变量/函数**：统一 camelCase。
- **API 文件**：`src/api/*` 全部 kebab-case。

---

## 8. 类型、常量与工具收敛策略

- admin 内部类型 → `src/types`。
- admin/portal 共用类型 → `packages/web-types`（仅放与后端无耦合的纯前端类型）。
- 与后端相关类型：不手动维护，未来由 OpenAPI Generator 接管。
- `src/lib`：按功能子目录拆分（示例：`lib/date`、`lib/format`）。
- `src/constants`：按领域子目录拆分（示例：`constants/assets`、`constants/auth`）。

---

## 9. 测试文件组织

- 测试文件路径镜像化，与源码路径一致。
- 使用同目录 `__tests__` 或同级 `*.test.tsx`，禁止集中到单一目录。
- 迁移时同步更新 import 路径。

---

## 10. 质量与性能基线（结合经验规范）

### 10.1 前端代码质量清单（frontend-code-review）

- **className 合并必须使用统一工具**（禁止手写拼接）。
- **优先使用 Tailwind**，减少新增样式文件。
- **className 顺序**：组件默认样式在前，外部 className 在后，便于覆写。

### 10.2 Zustand 状态管理规范

- **动作分层**：
  - 公共动作：`createTopic`、`sendMessage`
  - 内部动作：`internal_createTopic`
  - 派发动作：`internal_dispatchTopic`
- **乐观更新**：适用于创建与更新，删除操作不使用乐观更新。
- **状态命名**：
  - Map：`messagesMap`、`topicsMap`
  - 选中/激活：`activeTopicId`
  - 初始化标识：`topicsInit`

### 10.3 Vercel React 性能实践（精选）

- `async-parallel`：独立请求使用 `Promise.all`。
- `async-defer-await`：只在需要的分支中 await。
- `bundle-barrel-imports`：避免 barrel 导入导致包体积膨胀。
- `bundle-dynamic-imports`：重型组件使用动态加载。
- `rerender-memo`：复杂 props 通过 `useMemo` 稳定引用。
- `rerender-derived-state`：派生状态直接计算，避免多余订阅。

---

## 11. 执行步骤（实施阶段）

1) 生成迁移映射表（旧路径 → 新路径）。
2) 迁移 views 页面组件到 routes，迁移完成后删除 views 目录。
3) 扁平化 UI 组件并去重。
4) 重组项目组件与 data-table 目录。
5) 全量统一命名与路径。
6) 类型/常量/工具归档。
7) 测试文件镜像化。
8) 修正 import 与别名配置。

---

## 12. 验收标准

- `pnpm --filter @celestial/admin typecheck` 通过。
- `pnpm --filter @celestial/admin lint` 通过。
- `pnpm --filter @celestial/admin test` 通过。
- 手动回归：登录、团队、资源管理、设置页面正常可用。

---

## 13. 风险与回退策略

- **风险**：大规模重命名导致路径遗漏。
  - **回退**：严格按映射表逐步迁移，执行全局检索校验。
- **风险**：UI 组件去重导致行为差异。
  - **回退**：优先保留 animate-ui 实现，回归关键页面。

---

## 14. 后续路线

- portal 端按同样规范对齐（分阶段迁移）。
- 引入 OpenAPI Generator 自动生成前端类型。
- 持续优化性能指标与组件库维护成本。
