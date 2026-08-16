# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**核心用户：需要内容管理与网站构建的中小团队**（`docs/interview/project-introduction.md:14`；用户确认与文档口径一致）。

- 建站过程的主要操作者是非技术背景的建站者，与内容运营、设计运营协作；高阶用户需要键盘操作与批量工作流（`docs/spec/shared/ai-website-builder-platform.md:175-179`）。
- Workspace 内的另一类用户是普通 Workspace Owner、内容负责人、设计师、协作者——他们使用 Knowledge、Skills、Design Systems 定制 AI，其语言不是「开发者包模型」（`docs/spec/shared/product-admin-experience-redesign.md:172`）。
- 平台侧用户为 Instance Owner 与 Platform Operator（部署级运营者，非租户角色）。

## Product Purpose

Arclayer 是一个 AI 原生的多租户内容平台（SaaS）：团队在 Workspace 中定义内容模型、创建内容，通过可视化 Site Builder 构建对外站点；AI 助手深度参与内容建模、建站与运营全流程（`docs/interview/project-introduction.md:5`）。

核心结果契约：让一个 Workspace 从 brief 出发，不离开产品即可交付一个受管、响应式、可访问、可发布的网站。结果不是「仅导出」的设计概念，也不是聊天演示（`docs/spec/shared/ai-website-builder-platform.md:20`）。

**成功定义（用户确认）**：AI 全程交付——从 brief 到可发布站点全程不离开产品。行为性成功为「评审通过的版本可预览，或通过规范发布服务发布」（`ai-website-builder-platform.md:178`）。暂无量化指标。

**阶段（用户确认）**：早期开发，无真实客户。不得虚构客户、证言、案例或基准数据。

## Positioning

- **可发布终态**：Design 是可发布终态，包含响应式规则、动效、内容绑定、SEO、可访问性、预览与发布就绪；区别于「导出型」建站工具（`docs/spec/shared/ai-website-builder-platform.md:29`）。
- **可追踪 revision 模型**：参考 Relume 的可视化编辑工作流，但不复制 Relume 的导出与 Webflow/Figma 工作流——Sitemap、Wireframe、Style Guide、Design 是同一版本化站点模型的四个投影（`docs/plan/ai-builder-product-direction.md:414`；`ai-website-builder-platform.md:28-29`）。
- **AI 写入受控**：AI 变更从不作为无追踪的提示副作用落地；每次写入都是带基础版本、来源、预览/差异、幂等键与显式结果的类型化命令或 ChangeSet（`ai-website-builder-platform.md:36-37`）；项目级 Agent 采用只读运行 + 审批门控（`docs/interview/project-introduction.md:117`）。
- **设计定位**：严肃的产品工作台（DESIGN.md）——比 Notion 的暖纸感更干净、更技术化；不是协作玩具，不是营销页伪装的管理面板。
- 仓库中无正式竞争格局或市场分析文档（探索确认）；上述差异化机制是文档中唯一明确的定位依据。

## Operating Context

- 两个应用 + 一个后端：客户使用 Product Application（`apps/app`）建站并管理当前 Workspace；Instance Owner 与 Platform Operator 使用 Platform Console（`apps/platform`）做部署级运营；两者消费同一模块化后端（FastAPI 双组合根）（`docs/spec/shared/product-platform-separation.md:13-20`）。
- 租户边界：Workspace 是协作与商业边界（唯一 Commercial Tenant），Project 是内容边界、可发布独立站点（`docs/interview/project-introduction.md:15`）。
- 使用中涉及的材料：内容模型（Content Type / Entity Manager）、不可变站点版本清单（SiteRevisionManifest）、ChangeSet、BuilderGeneration、SitePreviewArtifact；知识源（manual / file / url / connector / structured_content）；技能包（builtin / inline / archive / github）；设计系统版本（DesignSystemVersion）。
- 交付面：Content Delivery API（`/content-api/v1`，x-api-key 或 Bearer delivery-key；Admin token 不授予 Content API 权限）、Images API、Meilisearch 搜索；站点通过规范 release 服务发布。
- 作者模式：builder_managed 与 source_managed（内容可由外部工具编写后导入）两种。
- 商业化闭环：计划/计划修订（祖父订阅）、额度/权益/功能席位、催缴、支付宽限、受限恢复模式、自动充值；Stripe 与模拟计费插件。
- 部署栈：PostgreSQL 16 + pgvector、Valkey 8、Meilisearch、S3 兼容存储、LiteLLM、Traefik；docker-compose；后台 job 为 taskiq worker（发布、渲染、资产处理、agent-io、连接器）。

## Capabilities and Constraints

功能：

- 结构化内容建模与版本化交付（Entity Manager + Content Delivery API）
- 可视化 Site Builder：Sitemap → Wireframe → Style Guide → Design 四阶段；编辑器含 AI 侧栏、访客预览工作台、设计检查器、composition saga 阶段轨
- AI 对话式建站：ExecutionMode = plan（只读 + 候选 ChangeSet）| build（写入须经类型化命令/审批）；审批队列、Agent 线程历史
- 工作区级 AI 定制：知识库（RAG，租户隔离 pgvector，引用与隔离区）、技能包（声明式，绝不可执行插件）、设计系统（不可变版本，供 Agent 消费以保证产出符合设计规范）
- 商业化：计划/订阅/额度/支付失败恢复/自动充值
- 平台控制面：租户/工作区、用户、项目、身份与访问、AI 服务与技能目录、商业、扩展、监控、站点交付、系统设置
- 可观测：结构化日志、审计、运营信号队列
- 交付 SDK 与站点渲染器（`delivery-sdk`、`site-renderer`）

术语：

- Workspace / Project / Site Revision / ChangeSet / Agent / Orchestrator / Skill / Tool / Knowledge / Connector / Thread / Run / ExecutionMode / DesignSystemVersion / Plan / Credits / Feature Seats（规范词汇表见 `docs/spec/shared/ai-website-builder-platform.md:303-314`）
- 站点状态机：blank → generating → draft_ready → publish_blocked → published

约束：

- 首版 Workspace 角色：Owner、Admin、Editor、Viewer（`docs/plan/ai-builder-product-direction.md:752`）；Owner 是所有权不变量、不可选择，唯一持有计费/所有权转移/删除工作区权限；Billing Manager 是派生职责而非硬编码角色
- 平台侧无合成超级角色：Platform Operator 仅通过一个或多个 Platform Role 获得权限（加性去重并集）；Platform MFA 强制、设备绑定会话、升级验证
- 双平面分离不变量：Workspace 商业与生命周期权限绝不成为 Platform 权限，Platform 权限绝不成为租户冒充（`docs/spec/shared/product-platform-separation.md:18`）；跨平面读取客户内容需精确 Platform 权限 + Workspace Owner 创建的限时 Support Access Grant
- 站点托管连续性：计费/技术事故期间由 Hosting Continuity Window 与 Delivery Suspended 治理已发布站点

未决事实：

- 「Arc」/「Layer」在产品层没有定义，仅存在于品牌标记解释（DESIGN.md）
- 无量化成功指标（用户确认成功定义为 AI 全程交付的行为性结果）
- 条款与隐私政策仅为占位文案，无真实法律文本

## Brand Commitments

- 产品名 **Arclayer**，标语「Structured content, visually built. / 结构化内容，可视化构建。」；两个 locale 中均保留拉丁字母写法
- 品牌标记 **Arc Weave**：四片有机弧石互锁为一个连续核心；四片旋转结构 + 圆润内腔必须保留；主标记单色（浅色面近黑 `#1D1D1F`，深色面柔白 `#F5F5F7`）；favicon 与紧凑导航用独立标记，认证/邀请用完整 wordmark（DESIGN.md）
- 命名承诺：`apps/app` 称 **Product Application**（客户产品），`apps/platform` 称 **Platform Console**（部署级管理台）；「admin」不是共享产品/领域术语，不得作为 Product Application 的同义词（AGENTS.md；ADR 0036）
- 一份共享视觉语言（ADR 0040）：Product 与 Platform 共享 `packages/ui` 的 token 权威；仅 Light / Dark / 跟随系统；蓝色保留给选择与主操作；模板调色板、主题画廊、任意强调色选择器、外来字体/圆角/海拔体系、渐变仪表盘、霓虹辉光、玻璃拟态——即使出现在采纳来源中也不引入
- Platform Console 拥有独立文案目录（ADR 0044）：稳定语义意图 i18n key；用户撰写的名称/备注/原因/标签永不机器翻译
- 双语交付：zh-CN 与 en-US 一起发布并保持同等含义与动作层级；DEFAULT_LOCALE = zh-CN；`locale:check` 强制齐平
- 图标用 lucide-react，不引入竞争性图标/图表栈（AGENTS.md）
- 版权行「Copyright © 2026 Arclayer. All rights reserved.」；无商标注册、无 LICENSE 文件（探索确认）

## Evidence on Hand

- 真实证据：无客户名称、证言、案例研究、媒体或基准数据（探索确认）——未来工作不得虚构这些
- 品牌资产：`apps/app/public/logo.svg`、`logo-dark.svg`、`logo-full.svg`、`logo-full-dark.svg`；`apps/platform/public/logo.svg`、`logo-full.svg`、`logo-full-dark.svg`；动画加载器 `apps/app/src/components/layout/arc-weave-loader.tsx`；`apps/app/public/provider-icons/` 与 `illustrations/content-guard/`
- 条款与隐私仅占位（`locales/*/auth.json`），非真实法律文本
- 产品规范与实现契约：`docs/spec/**`（英文规范层）、`docs/interview/project-introduction.md`（中文产品总览）、`docs/adr/**`（品牌与架构承诺）
- 视觉语言：DESIGN.md（完整设计语言：语义色、平台原生字体栈、动效、组件、产品护栏）

## Product Principles

1. **发布是终态**：一切建站工作以「受管、响应式、可访问、可发布的站点」为唯一产出物；导出型交付是反模式。
2. **AI 写入必须受控**：任何 AI 变更都要可追踪、可预览、可审批、可回滚；信任来自门控而非能力。
3. **双平面各司其职**：Workspace 是协作与商业边界，Platform 是部署边界；两者权限绝不互相渗透。
4. **结构化是地基**：内容模型与版本化站点模型先于任何表面呈现；可视化是表达方式，不是替代。
5. **双语与可访问性是一等公民**：zh-CN 与 en-US 同等交付，WCAG 2.2 AA 是硬性基线。

## Accessibility & Inclusion

- WCAG 2.2 AA 对比度为硬性要求（`docs/guidelines/frontend-design.md`；DESIGN.md）
- 图标按钮需可访问名称；装饰图标与 emoji 不进辅助功能树
- 触控目标 44px、支持 reduced motion（`docs/spec/app/frontend/ai-agent-experience.md`）
- 双语交付（zh-CN 默认，en-US 同等）；字体栈以平台原生中文字体优先（DESIGN.md）
