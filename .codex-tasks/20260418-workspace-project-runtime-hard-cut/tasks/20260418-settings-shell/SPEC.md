# Child Task Spec: Settings Shell Workspace And Project Split

## Goal

把现有 `/settings/workspace/*` 从旧 workspace-as-site 语义重构成新的 context-aware settings shell，拆成 workspace 设置与 project 设置两组菜单，同时把 team 相关页面并入对应设置分组。

## Scope

- 重建 `/settings/workspace/*` 的菜单分组和页面壳层
- 保留当前位置的 project 设置入口，按新语义原位替换为 project settings
- 复制并改造 workspace settings 入口，使其在 `/settings/workspace/general` 提供 workspace 级配置
- 样式与交互对齐 `/settings/personal/*`
- 让设置 shell 根据当前 workspace/project context 读取对应配置，减少重复菜单

## Non-Goals

- 本子任务不完成所有团队治理后端 contract
- 本子任务不处理 runtime publish UI
- 本子任务不为旧 `/team/*` 路由保留长期兼容层
