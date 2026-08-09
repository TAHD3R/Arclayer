# AI 建站实施 Prompt Pack

配套方向文档：[`ai-builder-product-direction.md`](./ai-builder-product-direction.md)

使用方式：每次开启新对话时，复制“通用前置 Prompt”加上对应阶段 Prompt。严格按阶段顺序执行，不要跨阶段顺手重做其他模块。

## 通用前置 Prompt

```text
你正在实现 Arclayer AI 建站产品。先完整阅读：

- AGENTS.md
- docs/guidelines/ai-builder-product-direction.md
- 当前阶段涉及的 docs/spec/**
- 当前阶段涉及的 docs/guidelines/**

你不是单独工作的代理。只修改本阶段明确负责的文件和模块，不撤销其他人的改动。

工作规则：

1. 先做仓库事实调查，再提出实施计划；不要凭空假设 API、路由、模型或测试存在。
2. 修改任何函数、类或方法前，先运行 GitNexus impact analysis，并报告影响范围；高风险时先停下说明。
3. 遵守 Debug-First：不添加静默 fallback、mock-success、吞错、假数据或临时旁路。
4. 失败必须暴露真实阶段、错误和恢复状态。
5. 只使用真实持久化、真实 Tool、真实 Run 和真实渲染路径。
6. 每个修改先读目标文件，保持最小 diff；不要修改 lockfile、缓存、构建产物或 node_modules。
7. 涉及 E2E/Playwright 时，先读取 data/local-admin-credentials.md；凭据只存于本地运行上下文，不得写入源码、测试报告、日志、截图、提交信息或最终回复。
8. E2E 必须验证用户可观察结果和服务器真实状态，不只验证页面渲染。
9. 完成前运行受影响的静态检查和焦点测试；提交前运行 GitNexus detect changes。
10. 最终回复必须包含：修改文件、关键行为、验证命令与结果、未完成项和真实阻塞原因。

如果本阶段依赖前一阶段尚未完成，先报告阻塞，不要用兼容层或假实现绕过。
```

## 对话 1：现状基线与旧数据清理准备

```text
阶段 1：只做现状基线和清理准备，不修改产品行为。

请根据方向文档第 26 节，调查当前 AI 创建链路、Editor、Builder 初始化、旧 site-builder 路由、内容库、项目设置、Platform Console、测试和数据表。

输出：
- 真实调用链和关键文件/符号（带 file:line）；
- 新旧执行路径、重复模型和风险；
- 旧入口与旧数据的清理范围；
- 开发/测试环境清理前置条件；
- 阶段 2/3 的明确依赖。

不要提交代码，不要删除数据，不要启动长驻服务。
```

## 对话 2：统一 AI 建站运行时

```text
阶段 2：只统一 AI 建站运行时。

目标链路：Workspace Thread brief → Coordinator Plan → 用户确认 → Build Run。
Build 确认前不得创建 Project、Site、Environment 或 Content Model。

实现范围：Coordinator、Plan/Build Run、Typed Tool、后台 Agent delegation、手动 @Agent、权限继承、幂等、失败恢复、取消、断流恢复和持久化状态。

必须保留：Coordinator 是主入口；Agent 消息显式署名；普通局部编辑不逐次确认；高影响操作二次确认。
不要修改自由画布、CMS 页面、CLI 或 Platform Console。

涉及 E2E 时读取 data/local-admin-credentials.md，并用 Playwright 验证中文 brief、Plan 确认、真实 Build、失败/恢复、刷新恢复和 Agent 标识。
```

## 对话 3：Project/Site/Builder baseline 初始化

```text
阶段 3：只修复 Project、Site、Preview Environment、Design System assignment 和 Builder baseline 初始化。

Build 必须一次性创建真实 builder-managed Project、Page/Article/Reusable Section 基础、ContentStructureRevision、SiteRevisionManifest、预览环境和可编辑草稿，不自动发布。

Editor bootstrap 必须返回真实 project/site/authoring mode/capabilities/status，并直接打开 Sitemap；不得跳转 /content/site-builder，不得返回客户端假基线。

覆盖失败前置、部分失败、取消、幂等、刷新恢复和权限错误。不要实现自由画布、CMS 高级能力、自定义域名或 CLI。

涉及 E2E 时读取 data/local-admin-credentials.md，用 Playwright 验证“新 Thread → Plan → Build → Editor → Sitemap”。
```

## 对话 4：Sitemap 与 Wireframe 编辑器

```text
阶段 4：只实现统一 Editor 的 Sitemap/Wireframe 主流程和自由画布。

入口唯一为 /projects/{projectId}/editor。采用 DOM/CSS 真实渲染，保证所见即所得；Canvas/WebGL 只能用于选区、辅助线、缩放或性能增强。

实现：Sitemap 页面树、Wireframe Section 层级、选中态、拖拽排序、缩放、对齐、属性面板、响应式断点、Sitemap→Wireframe 明确同步、自动保存、撤销/重做、并发冲突提示。

AI 局部修改直接作用于当前选区；内部产生 ChangeSet 用于审计和恢复。禁止任意像素绝对布局、任意代码组件和第二个 site-builder 编辑器。

涉及 E2E 时读取 data/local-admin-credentials.md，用 Playwright 验证编辑、保存、刷新恢复、局部 AI 修改、撤销/重做和冲突。
```

## 对话 5：Design System、Library 与 Remix

```text
阶段 5：只实现 Design System、官方组件/Section Library 和 Remix 变体。

Workspace 有默认 Design System；项目绑定后只允许受控项目覆盖。Library 支持分类、搜索、筛选、响应式预览、插入、Remix 和保存资产。

Remix 指基于已有模板/Section 生成独立变体：保留来源、变更摘要和兼容约束；原模板升级不得静默覆盖已有变体；用户确认后可保存为 Workspace Reusable Section 或模板。

AI 可组合官方组件、调整结构和变量、基于模板 Remix，但首版不生成编辑器无法维护的任意代码，也不开放 React/CSS 上传。
```

## 对话 6：内容库与专业 CMS

```text
阶段 6：只重做 Content Library 和首版专业 CMS 能力。

一级内容入口保持简单，按 Pages、Articles、Reusable Sections 分类；不要做数据库式一级导航。首版核心模型固定为 Page、Article、Reusable Section，但允许增加字段，并为下一版自由内容模型保留 schema/关系契约。

实现：统一数据源、Draft/Published/Archived、多语言内容、按语言发布、批量操作、媒体关系、Author/Category/Tag 等稳定 ID 引用、归档引用检查、完整 SEO 字段和预览。

页面正文主要在 Editor 直接编辑；Content Library 负责列表、状态、批量、SEO、关系和集合管理。禁止 In Review 状态、数据库管理页和第二份内容真相。

涉及 E2E 时读取 data/local-admin-credentials.md，用 Playwright 验证多语言 Article、编辑器/内容库同步、媒体关系、归档阻断和 SEO 保存。
```

## 对话 7：Preview、域名、环境与发布

```text
阶段 7：只实现站点运营链路。

项目创建后立即提供默认预览地址；自定义域名不阻塞创作。普通用户只看到预览/生产两个目标，底层环境变量和部署细节放高级设置或 Developer 分区。

实现：真实 Preview、Production、readiness、DNS/SSL 状态、立即发布、定时发布、按语言发布、失败恢复、发布审计和回滚/恢复语义。Build 不自动发布。

发布前必须展示受影响页面、内容、语言、域名和阻塞项。预览与生产使用同一渲染和内容读取路径。

涉及 E2E 时读取 data/local-admin-credentials.md，用 Playwright 验证预览、发布阻塞、立即发布、定时任务和失败状态。
```

## 对话 8：Knowledge、Skills 与上下文可见性

```text
阶段 8：只把 Knowledge、官方 Skills 和用户自定义 Skills 接入真实建站上下文。

Knowledge 是 Workspace 级事实来源，Plan、Build 和 Editor AI 默认可用；用户可查看、选择或排除来源，生成内容保留 provenance。

Skills 由官方基础 Skills 和用户自定义 Skills 组成。Coordinator 自动选择合适 Skill；用户可通过 @Agent 指定专业 Agent。消息必须显示 Agent、使用的 Skill、影响范围和结果，但不展示隐藏思维或冗长内部通信。

自定义 Skill 不得绕过权限、事实来源、操作确认或发布检查。不要把 Skills 做成普通用户必须编辑 Prompt 的页面。
```

## 对话 9：Developer 分区与 Platform Console

```text
阶段 9：最后收敛 Developer 分区和 Platform Console。

Developer 分区放在个人设置浮层的侧边菜单，管理 API、Webhook、访问令牌和外部集成；每项能力必须说明真实使用场景、权限范围、数据方向和风险。

Platform Console 只管理组织、Workspace、成员权限、账单、Feature Flags、运行健康和审计，不管理项目页面、内容、Sitemap、Wireframe 或 Design System。

删除 AI Slop：通用 JSON 配置编辑器、技术化一级文案、无真实生命周期的占位页和重复项目管理入口。

涉及 E2E 时读取 data/local-admin-credentials.md，用 Playwright 验证 Developer 权限边界和 Platform Console 的真实管理动作。
```

## 每次新对话的结束格式

```text
阶段：
完成内容：
修改文件：
关键行为变化：
验证命令与结果：
Playwright 场景与结果（如适用）：
GitNexus impact/detect_changes 结果：
未完成项：
真实阻塞原因：
方向文档追加位置：
```
