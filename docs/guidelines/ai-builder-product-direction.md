# AI 建站产品实施方向

状态：已确认的产品方向备忘录

本文记录当前阶段已经确认的产品边界、实施顺序和判断依据，用于防止上下文压缩或后续迭代导致方向漂移。

本文是实施方向，不替代 `docs/spec/**` 中的 API、持久化、权限和前端合同。实现时仍以对应规范为准；若规范与本文冲突，应先更新规范再改代码。

## 一、已确认的产品决策

1. 第一阶段只支持 `builder_managed` 项目。
2. 新建项目后创建真实草稿和 Builder 基线，不自动发布。
3. 首批内容模型只保留：
   - Page
   - Reusable Section
   - Article
4. `/projects/{projectId}/editor` 是唯一视觉创作入口。
5. `/projects/{projectId}/content/site-builder` 不再承担视觉编辑器职责。
6. AI 写操作统一经过 durable Run、Typed Tool、ChangeSet、按风险确认和内部保存点；普通局部编辑不要求逐次确认。
7. 域名、环境、预览、发布和内容库重新围绕“站点运营”组织。
8. API 作为开发者/高级能力；第一阶段不展示 `builder_managed` 项目的数据库管理页面，并移除 CLI 产品入口，不阻塞普通建站流程。
9. Knowledge、Skills、Design System 必须进入项目创建和编辑器上下文，不能继续作为孤立设置页。
10. 管理后台最后重做，不继续堆叠没有完整生命周期的页面。

## 二、唯一主流程

```text
Workspace Thread 输入 AI brief
  → Coordinator Plan
  → 用户确认计划
  → Build 创建 builder-managed Project
  → 创建 Site 与 Preview Environment
  → 绑定 Design System
  → 创建 Page / Reusable Section / Article 内容基础
  → 建立 ContentStructureRevision
  → 建立 SiteRevisionManifest / Builder baseline
  → 打开 Sitemap
  → Wireframe
  → Design
  → Preview
  → 用户明确发布
```

目标状态机：

```text
blank → generating → draft_ready → publish_blocked → scheduled → publishing → published
                     ↘ failed / cancelled                         ↘ publish_failed
published → draft_changes → publish_blocked
```

首次创建完成后的产品承诺是“已有可编辑草稿和预览”，不是“已经发布”。

## 三、当前根因记录

### 1. AI 创建项目没有建立 Builder 基线

当前 `workspace-actions` 的 `create_project` 流程会创建项目、内容模型、Home 内容、草稿、路由并直接发布 Release，但没有调用 Builder 初始化服务。

证据：

- `apps/api/src/modules/ai/workspace_actions.py` 中 `create_project` 分支。
- 同文件 `_bootstrap_created_project_content()` 会创建 Page / Reusable Block 模型和 Home 内容，并调用 `publish_release_out()`。
- Builder 初始化接口已经存在于 `apps/api/src/modules/projects/builder/router.py` 的 `POST /projects/{project_id}/builder/initializations`。

结果是：项目已经有内容和 Release，但没有 `ContentStructureRevision`、`SiteRevisionManifest` 和准确绑定的 Design System / Preview Environment。编辑器因此得到 `initializationRequired`，显示“站点还没有创作基线”。

### 2. 当前存在两个建站中心

- 目标编辑器：`apps/app/src/pages/projects/editor/page.tsx`
- 旧管理页：`apps/app/src/pages/projects/content/site-builder/page.tsx`

当前编辑器在初始化或迁移状态下会跳转到 `/content/site-builder`。旧页面本身是 Admin 风格的指标、卡片和虚线画布，不是四阶段视觉创作空间。这是错误的路由和产品边界，不是单纯文案问题。

### 3. AI 执行路径未收敛

当前同时存在：

- `workspace-actions`：LLM 规划后直接执行项目、内容、源码和站点设置动作。
- assistant-ui / Agent runtime：Thread、Run、事件流、审批、恢复和 Tool UI。

编辑器中的 Sitemap 生成还会自行创建 Thread 和 Run。结果是同一类 AI 写操作可能走不同的权限、审批、恢复和 revision 语义。

### 4. 内容和设置有能力，但没有产品主线

Content Library、Content Models、Domains、Environments、API Keys、Databases 都有真实 API 和部分操作，但页面之间没有用“创建、预览、发布、运营”的用户任务串起来。

Knowledge、Skills、Design Systems 也已有后端和页面基础，但目前主要呈现为独立 Workspace 设置，用户无法看到它们如何改变一次具体建站或 Agent Run。

## 四、实施波次

### Wave 0：收敛并验证一条垂直链路

只验证一个真实场景：

```text
中文建站 brief
→ 创建 builder-managed 项目
→ 建立 Builder baseline
→ 打开 Sitemap
  → AI 生成或修改页面
  → 普通局部编辑直接应用，高影响操作确认
  → 内部产生 ChangeSet 并保存操作结果
→ Wireframe / Design / Preview
→ 明确发布
```

在该链路跑通前，暂停新增：

- 新 Agent
- 新 Skill 类型
- CLI 功能
- 数据库功能
- 内容高级设置
- Platform 管理后台页面

### Wave 1：修复创建链路

把 Project 创建、Site、Preview Environment、Design System assignment、内容基础、ContentStructureRevision 和 SiteRevisionManifest 组合为一个可恢复的 durable composition workflow。

要求：

- 失败阶段可见；
- 可恢复或明确失败；
- 不自动发布；
- 不创建客户端假基线；
- 返回真实 `draft_ready` / `publish_blocked` 状态；
- 所有副作用带 idempotency 和 provenance。

### Wave 2：让统一 Editor 和自由画布真正可用

保留 `/projects/{projectId}/editor` 作为唯一入口和路由契约，先接入真实项目状态、Sitemap、Wireframe、Design 和 Preview 阶段，再按已确认的 DOM/CSS 所见即所得原则实现自由画布。不能继续把旧的 Admin 风格画布当作最终编辑器。

必须先完成：

- Editor bootstrap 返回真实 project/site/authoring mode/revision/capabilities；
- Sitemap 显示真实 Home 页面；
- AI 生成和局部编辑通过统一 Run/Typed Tool 写入当前工作副本；内部保留 ChangeSet 用于撤销、重做、审计和恢复；
- Wireframe、Style Guide、Design 共享同一个 revision；
- Preview 使用真实 render document；
- Publish 使用真实 readiness 和 release 服务；
- 错误、部分成功、冲突、取消、刷新恢复都来自服务器事实；
- 画布对象直接映射到页面、Section、组件和内容槽位，并能由同一渲染模型生成 Preview。

### Wave 3：重做内容和站点运营信息架构

#### Content Library

围绕以下对象组织：

- 页面
- 可复用区块
- 文章及其集合
- 媒体
- 内容关系与全局字段

默认优先级是标题、类型、状态、完整性、预览、使用位置和下一步动作；内部 ID、模型 key、presentation 和 runtime 信息进入诊断或高级详情。

#### Content Models

首批只围绕 Page、Reusable Section、Article 设计。入口先问“网站为什么需要这个内容类型”，然后展示 schema outline、字段、已有内容、影响范围和迁移计划。

#### Domains / Environments / Preview / Publish

合并为站点运营链路：

```text
草稿
→ 预览环境
→ readiness
→ 域名与证书
→ 发布
→ 回滚 / 恢复
```

API Keys 归入开发者/集成；第一阶段的 `builder_managed` 项目不显示数据库管理页面；CLI 从首期产品表面移除。

### Wave 4：把 Knowledge、Skills、Design Systems 接入建站上下文

- Knowledge：显示本次生成使用的 workspace/project guidance、来源和引用。
- Skills：显示本次 Run 使用的 Skill、适用结果、测试证据和团队采用情况。
- Design System：显示当前 revision 使用的精确版本、代表性页面预览、验证结果和更新影响。

Customization 页面只负责团队复用、版本、治理、采用和退休；项目创建与编辑器负责实际应用。

### Wave 5：最后重做 Platform Console

Platform 后台按“运营对象”组织，而不是按后端模块堆页面：

```text
对象
→ 当前状态
→ 影响范围
→ 可执行操作
→ 操作进度
→ 验证结果
→ 变更历史
```

优先删除或收敛：通用 JSON 配置编辑器、技术化一级文案、没有完整生命周期的路由、无真实动作的占位页。

## 五、第一阶段验收标准

一个全新的项目必须能完成：

1. AI 能正确理解中文 brief，并通过统一 Coordinator/Run 路径执行，支持后台 Agent delegation 和手动 `@Agent`。
2. 项目创建后自动拥有真实 Builder baseline，而不是进入阻塞提示。
3. `/projects/{id}/editor` 直接打开 Sitemap，显示真实 Home 页面。
4. AI 生成结果显示 Tool 状态、变更摘要、影响范围和应用结果；普通局部编辑直接应用，高影响操作先确认。
5. 应用变更后，内部保存点、内容版本和 presentation 重新从服务器同步。
6. Wireframe 和 Design 不创建第二份页面真相。
7. Preview 是真实页面渲染，不是占位卡片或假成功。
8. 首次发布由用户明确触发，失败时保留草稿并显示可恢复状态。
9. 刷新、断流、取消、权限变化和冲突不会制造假成功。
10. Content Library、Domain、Environment、Publish 之间能解释清楚同一条站点运营链路。

## 六、暂时禁止的方向漂移

- 不再把 `/content/site-builder` 修成第二个编辑器。
- 不再通过增加 prompt 数量掩盖 Agent 执行路径分裂。
- 不再让 AI 绕过内部 ChangeSet / 保存点直接产生不可撤销、不可审计的写入。
- 不再把每个后端模块单独做成设置页。
- 不再在主流程中暴露 API、数据库、CLI 的内部实现概念。
- 不再用 mock、模板结果或本地状态伪造生成、发布或 Tool 成功。

## 七、已确认的生成与 Agent 交互决策

### 1. 新建项目默认生成完整 Starter Site

用户提交建站 brief 并确认计划后，系统默认生成一个完整但范围受控的 Starter Site，而不是只创建空项目或单个 Home 页面。

Starter Site 至少包含：

- Home；
- 根据 brief 推导的基础信息页面，例如 About / Company；
- Contact 或等价的转化页面；
- 对应的 Sitemap、导航关系、页面目的和初始 section intents；
- 可进入后续 Wireframe、Design 和 Preview 阶段的真实内容版本与 Builder revision。

具体页面名称和数量由 Site Architect 根据用户目标、行业、受众和 brief 生成候选计划。系统不得无条件套用固定页面模板，也不得为了显得完整而生成与业务无关的页面。

首次生成仍然是草稿。任何 Starter Site 页面都不得因为创建成功而自动发布。

### 2. Coordinator 是唯一用户对话入口

Arclayer Coordinator 是普通用户默认且唯一的主对话 Agent。Site Architect、Content Writer、Visual Designer、SEO Strategist 等专业 Agent 作为 Coordinator 的后台协作者存在。

交互边界：

- 一个用户任务只有一个主 Thread；
- 用户不需要理解如何选择专业 Agent 才能完成建站；
- Coordinator 根据任务和权限通过后端 typed delegation 调用专业 Agent；
- 专业 Agent 的进度、Tool、证据和结果嵌套显示在父 Run 中；
- 专业 Agent 不自动创建独立顶层 Thread；
- 用户可以查看参与者和工作分工，但不能通过前端 fan-out 绕过 Coordinator、权限或审批策略；
- Workspace 自定义 Agent 仍可作为可治理能力存在，但不成为首个建站流程的前置选择。

Agent 身份与执行模式保持分离。Coordinator 可以在 Plan 或 Build 模式下工作，不能重新引入“通用 Agent / 智能助手”作为第三种执行模式。

### 3. 默认先 Plan，确认后 Build

用户提交 brief 后，默认流程是：

```text
用户 brief
→ Coordinator 进入 Plan
→ 输出 Sitemap、页面范围、内容需求、Design System / Knowledge 使用情况、预计影响和阻塞项
→ 用户确认计划
→ 同一 Thread 创建 Build Run
→ 执行 durable generation workflow
```

Plan 阶段允许：

- 检索 Knowledge；
- 分析目标、受众和网站结构；
- 调用专业 Agent 生成候选方案；
- 生成候选 Sitemap、页面列表、内容需求和 ChangeSet 预览；
- 说明预计 Credits、依赖、缺失信息和发布阻塞项。

Plan 阶段禁止：

- 创建或修改项目、页面、内容模型、内容项、Design System assignment；
- 发布、部署、变更域名或执行外部写操作；
- 用本地状态或模板结果伪造已完成的 Build。

用户确认后，Build 在同一 Thread 中执行已确认的计划。若实际权限、项目状态、费用、Design System、Knowledge 或其他依赖已经变化，服务器必须重新验证并明确要求重新预览；不得静默执行过期计划。

首次计划确认是一次任务级确认，不要求用户为每个可逆草稿步骤反复确认。发布、域名、删除、外部写入和其他高风险操作仍按服务器审批策略单独确认。

## 八、已确认的首次建站范围与信息采集决策

### 1. Plan 在 Project 创建之前进行

首次建站的 Plan 是 Workspace-scoped Thread / Run。用户确认计划前，系统不创建空 Project、Site、Environment、Content Model、Content Item 或其他持久化建站对象。

完整顺序是：

```text
Workspace 中发起建站
→ 创建 Workspace-scoped Thread
→ Coordinator 运行 Plan
→ 形成可审阅的建站计划
→ 用户确认
→ 同一 Thread 创建 Build Run
→ Build 创建 Project 与完整 Starter Site
→ Thread 绑定新 Project 和初始 Site Revision
→ 自动导航到新项目的 Sitemap
```

Plan 输出必须包含足以让 Build 确定执行边界的结构化结果，例如：

- 项目名称和目标；
- 网站类型；
- 目标受众；
- 建议页面与导航；
- 每个页面的目的和初始 section intents；
- 预计使用的 Workspace Knowledge；
- 建议或选定的 Design System；
- 初始内容语言和目标 locales；
- 预计 Credits、依赖、假设和阻塞项。

Plan 是可重建的候选执行输入，不是未追踪的聊天文本。用户确认时，服务器固定计划版本、输入摘要和执行幂等身份。Build 不得重新自由解释为另一个网站范围。

如果 Build 在创建 Project 前失败，不得留下空项目。如果在持久化流程中部分失败，必须由 durable composition workflow 暴露真实阶段和恢复状态，不得返回完整创建成功。

### 2. 第一阶段网站类型范围

第一阶段只支持：

- 营销官网；
- 品牌官网；
- 企业网站；
- 内容型网站。

该范围可以包含网站内的 Article 内容、内容列表、详情页、FAQ、案例、团队和联系转化等普通内容能力。

第一阶段不承诺：

- 电商交易、购物车、订单和支付；
- 会员注册、登录后的个人中心和权限内容；
- 预约、库存、复杂工作流和业务审批；
- SaaS 仪表盘、后台应用和任意业务应用生成；
- 依赖自定义数据库逻辑的动态产品。

当用户 brief 明确需要上述范围外能力时，Plan 必须说明当前不支持的部分及其对网站结构的影响。不得把静态占位页面描述为已经实现的电商、会员或业务系统。

### 3. 只追问影响结构或执行的关键信息

Coordinator 不使用冗长问卷阻塞首次建站，也不在信息不足时无条件猜测所有业务事实。

必须追问的信息是会实质改变以下内容的关键缺口：

- 网站目标或网站类型；
- 主要受众；
- 核心转化动作；
- 语言或地区要求；
- 法律、合规、权限或敏感内容约束；
- 用户明确要求但可能超出第一阶段范围的功能；
- 多个解释会导致明显不同 Sitemap 或内容策略的歧义。

非关键缺口可以使用默认假设，例如页面命名、初始文案语气、建议页面数量和普通 section 组合，但必须：

- 在 Plan 中集中展示假设；
- 允许用户在确认前修改；
- 保留假设来源和 Plan provenance；
- 不把推断写成用户提供的事实；
- 不虚构客户、资质、统计数字、评价、合作伙伴或法律声明。

追问应尽量一次聚合成少量、可直接回答的问题。用户回答后继续同一个 Plan Run 或通过规范允许的 human-input Tool 恢复，不创建另一套临时对话状态。

## 九、首站内容、视觉与可视化编辑器决策

### 1. 生成内容的事实边界

首次建站生成的文案只允许使用用户 brief、Workspace Knowledge 和用户明确提供的事实。缺少事实时，系统必须使用明确标注的占位内容或待补信息，不得虚构客户、资质、统计数字、评价、合作伙伴、价格、案例结果或法律声明。

每一段初始内容都应保留来源和状态，例如：

- `user_fact`：来自用户输入或已确认的 Knowledge；
- `knowledge_fact`：来自 Workspace Knowledge；
- `assumption`：为完成结构而做的可修改假设；
- `placeholder`：等待用户补充的内容；
- `generated_copy`：基于已知事实生成的表达，不代表新的事实。

编辑器和 AI 对话都必须让用户能够识别并替换这些状态，不能把假设渲染成已经核实的业务事实。

### 2. Starter Site 的视觉基线

首站优先使用 Workspace 默认 Design System。若 Workspace 尚无默认 Design System，Build 可以创建一个初始 Design System，并将其作为本次 Site Revision 的明确依赖和可审阅产物。

第一阶段不为同一个 brief 同时生成多个视觉概念。视觉选择应通过 Design System、主题变量、组件变体和编辑器中的可控调整完成，以保持生成范围、审阅成本和后续 revision 的稳定性。

### 3. 参考 Relume 的可视化编辑器工作流

可视化编辑器采用“先结构、后线框、再视觉”的分阶段创作路径：

```text
Plan
  ↓ 用户确认
Sitemap / 页面树
  ↓ 用户调整结构
Wireframe / Section 结构与内容意图
  ↓ 用户调整页面和组件
Design System / 视觉样式与组件变体
  ↓ 用户确认视觉方向
Preview / 可运行预览
  ↓
已保存草稿 / Publish
```

这里借鉴 Relume 官方产品中的分层方式：先由 AI 生成 Sitemap，再将 Sitemap 转成低保真 Wireframe；用户可以在进入下一阶段前编辑页面名、Section 名称、Section 描述、顺序和组件。Style Guide/Design View 作为后续视觉化阶段，而不是在结构尚未确认时直接生成最终页面。

Arclayer 不直接复制 Relume 的导出和 Webflow/Figma 工作流，而是将每个阶段建模为同一站点的可追踪 revision：

- Sitemap 是页面与导航的结构模型；
- Wireframe 是页面 section intents、组件类型和内容槽位模型；
- Design System 是跨页面共享的视觉约束；
- Preview 是由当前 revision 渲染的可运行结果；
- AI 修改必须产生内部 ChangeSet；普通局部修改直接写入当前工作副本，高影响操作经用户确认后写入新的内部保存点。

### 4. 首次 Build 的粒度

首次 Build 不直接生成最终高保真成品，而是一次性创建 Project、Sitemap 和可供审阅的完整 Wireframe Starter Site。Wireframe 包含核心页面、section 结构、内容槽位及基于已知事实的初始文案；用户确认结构后，再进入 Design System/视觉化阶段和可运行预览。

因此，`9B` 的含义不是拆成多个互不关联的临时任务，而是在同一个 Workspace Thread 和同一个 durable creation workflow 中，固定经历“结构审阅 → 线框审阅 → 视觉审阅”的阶段转换。每个阶段都可继续、可回退并生成内部保存点，但不得绕过审阅直接宣称已完成发布。

## 十、可视化编辑器交互与用户可见术语

### 1. 统一编辑器入口

可视化创作统一使用 `/projects/{projectId}/editor`。编辑器内部提供 Sitemap、Wireframe、Design 和 Preview 四个阶段入口，并让它们共享同一站点上下文、当前工作副本和保存状态。不得让用户在多个互不关联的页面之间寻找不同编辑器。

### 2. Wireframe 采用自由画布方向

Wireframe 阶段按自由画布编辑器方向设计，而不是仅提供树状表单或只读预览。第一版需要明确画布坐标、页面/Section 层级、选中态、拖拽排序、缩放、对齐和属性编辑的交互模型。

是否采用 WebGL、Canvas 或 DOM/CSS 混合实现属于技术验证问题，不能先用技术名词替代产品定义。无论渲染技术如何选择，画布中的对象必须仍然对应可持久化的页面、Section、组件和内容槽位，最终预览必须能够还原为真实网站结构，而不是只能导出一张图片。

### 3. AI 修改采用直接编辑与撤销

AI 在编辑器中默认直接修改当前工作副本，用户不需要先理解 ChangeSet 或 revision 才能看到结果。每次 AI 操作必须提供清晰的变更摘要，并支持按操作撤销、重做和恢复到上一个可用保存状态；失败时必须暴露真实错误，不得伪装成成功。

ChangeSet、SiteRevision 等是内部一致性和持久化机制，不作为首要用户术语。用户界面优先使用“当前编辑”“已保存”“撤销”“重做”“恢复”“发布版本”等自然表达。

### 4. 所见即所得与画布技术原则

编辑器最高优先级是“所见即所得”：用户在画布中看到的布局、间距、字体、颜色、响应式行为和内容，必须尽可能等同于预览和最终发布站点的实际结果。画布不能只是示意图、截图或与真实渲染器不同的另一套布局规则。

因此采用 DOM/CSS 为主的真实网页渲染方向，Canvas/WebGL 只用于必要的交互增强、缩放、辅助线、选区和性能优化。画布对象必须直接映射到可持久化的页面、Section、组件和内容槽位；自由编辑不能破坏语义结构、响应式规则或最终 HTML/CSS 输出。

### 5. 自由画布的结构边界

第一阶段支持页面和 Section 的自由调整，包括顺序、宽度、间距、布局和组件组合；组件内部仍保持结构化和响应式约束。不承诺 Figma 式任意像素定位、任意绝对布局或无法稳定转换为真实网页的视觉效果。

### 6. 自动保存与操作恢复

手动编辑和 AI 操作都自动保存。每个完成的操作进入撤销/重做栈，并支持恢复到最近一次已保存状态。保存状态必须明确显示；保存失败、渲染失败或操作失败必须暴露真实错误，不得让画布停留在看似成功但无法持久化的状态。

### 7. 响应式编辑模型

编辑器维护一份结构化页面模型，通过断点和布局约束支持桌面、平板和移动端预览。默认不允许三套完全独立的页面副本；用户调整某个断点时，系统必须明确显示这是共享规则、断点覆盖还是仅影响当前视口的临时预览。

### 8. 选区感知的 AI 编辑

AI 对话必须感知当前选中的页面、Section 或组件。用户可以直接提出局部修改，例如“把这个 Section 改成两列”或“只替换这一段标题”，AI 默认只作用于选中范围，并在作用范围不明确时要求澄清，而不是静默修改整站。

### 9. Sitemap 到 Wireframe 的同步

Sitemap 是页面结构的上游模型。用户修改页面名称、层级或顺序后，Wireframe 通过明确的同步操作更新；同步前必须展示影响范围，已有 Section、内容和样式不得被静默覆盖。对于新页面，系统可以生成缺失的 Wireframe；对于已有页面，只能追加、映射或提出冲突供用户处理。

## 十一、内容模型、预览与域名决策

### 1. 首期内容模型

首期只保留三类核心内容模型：

- `Page`：页面级 SEO、导航和页面元数据，以及页面使用的 Sections；
- `Reusable Section`：可跨页面复用的结构化区块；
- `Article`：可集合管理、列表展示和详情渲染的内容型条目。

页面结构与内容字段分离。页面负责“在哪里展示”，内容模型负责“内容是什么”；同一 Article 可以被多个页面模板或 Section 引用。第一阶段不允许每个项目随意创建一套互不兼容的模型，也不把所有内容压扁成没有语义的任意 Block。

### 2. 预览与发布

Build 完成后默认进入预览环境，不自动发布到生产环境。用户明确点击“发布”后，系统才将当前可发布内容部署到生产环境，并在发布前显示域名、内容完整性、待补占位信息和阻塞项。

发布失败必须明确报告失败阶段和原因，不得显示为发布成功。预览环境必须使用与生产一致的页面渲染和内容读取路径，确保所见即所得。

### 3. 域名流程

项目创建后立即提供可用的默认预览地址，自定义域名属于发布阶段配置，不阻塞 Sitemap、Wireframe 或 Design 阶段的创作。域名页面应围绕“预览地址、绑定自定义域名、DNS/SSL 状态、当前发布目标”组织，而不是单独展示难以理解的基础设施字段。

## 十二、项目设置与开发者能力决策

### 1. 开发者分区

API、Webhook、访问令牌和外部集成属于开发者能力，不进入普通项目主导航。它们统一放在个人设置浮层的侧边菜单中的“开发者”分区，并以跨项目的身份、权限和集成管理为主。

开发者页面必须说明每项能力的真实使用场景、权限范围、数据方向和风险；没有配置或没有使用场景时，不应为了填充导航而展示空白的技术面板。

### 2. 环境模型

普通项目只暴露“预览”和“生产”两个目标及其当前状态。环境变量、部署配置、域名绑定和运行日志属于高级设置或开发者区域，不应要求普通用户理解底层基础设施。

### 3. 数据库模型

第一阶段的 `builder_managed` 项目不在普通项目中提供数据库管理页面。平台负责内容存储和运行时数据层，用户通过内容库、内容模型和发布流程管理业务内容。外部数据库连接和数据库运维不属于首期建站主流程。

## 十三、CLI、Knowledge 与 Skills 决策

### 1. CLI

CLI 不纳入第一阶段的建站、编辑或发布主流程，也不在普通产品导航中展示。现有 CLI 从首期产品表面移除。未来只有在本地预览、内容同步、代码/资源拉取或部署诊断等场景形成稳定契约后，才重新设计开发者 CLI。

### 2. Knowledge

Knowledge 是 Workspace 级事实来源，默认可被 Plan、Build 和编辑器 AI 使用。用户必须能查看本次操作使用了哪些来源，并能在需要时选择或排除来源；Knowledge 的事实 provenance 进入生成内容和 AI 操作记录。

### 3. Skills

Skills 同时具备两层：

- 官方提供一组受维护的基础 Skills，例如信息架构、SEO、内容质量、无障碍和品牌语气；
- 用户可以添加自定义 Skill，用于组织内部流程、写作规范或领域检查。

Coordinator 负责根据任务选择合适的 Skill。普通用户不需要管理底层 Prompt 或执行细节，但必须能看到当前使用的 Skill、它影响了什么结果，以及如何停用或调整用户自定义 Skill。自定义 Skill 不能静默绕过权限、事实来源和发布检查。

## 十四、Design System 与 Platform Console 决策

### 1. Design System 的归属

Workspace 可以拥有一个默认 Design System。项目创建时绑定一个 Design System，项目内可以进行受控调整，但不得破坏 Workspace 级系统的可复用性或让其他项目被静默修改。项目调整应明确区分“仅当前项目覆盖”和“更新 Workspace 默认系统”。

### 2. Design System 的编辑方式

Design System 以颜色、字体、间距、圆角、阴影、组件变体和页面预览为主要编辑对象。普通用户不需要直接编辑原始 CSS；底层 Token 和 CSS 输出属于系统生成结果或开发者诊断信息。AI 可以辅助修改，但最终结果必须能在可视化面板中检查和调整。

### 3. Platform Console 的边界

Platform Console 只负责部署级管理，包括组织、Workspace、成员权限、账单、Feature Flags、运行健康和审计。项目页面、内容、Sitemap、Wireframe 和 Design System 属于 Product Application，不在 Platform Console 中重复管理。

## 十五、实施顺序与旧能力处理决策

### 1. 第一阶段实施顺序

实施按一条可验收的主链路推进：

1. 统一 Coordinator、Plan/Build Run、Typed Tool、持久化状态和项目初始化；
2. 完成 Editor 主流程：Sitemap → Wireframe → Design → Preview；
3. 重做内容库、Page/Reusable Section/Article 模型以及预览发布；
4. 收敛域名、预览/生产环境和开发者设置；
5. 最后重做 Platform Console。

每个阶段都必须在真实数据和真实持久化路径上验收，不以静态 Mock 或孤立页面完成作为阶段结果。

### 2. 旧数据处理

第一阶段采用硬切换策略，不迁移旧项目和旧数据。旧数据不能被新流程假装兼容或继续写入；在删除前必须明确数据清理范围、备份/导出策略和用户可见提示。新流程只维护一套规范模型和一条 AI 执行路径。

### 3. 旧入口处理

`/content/site-builder` 不再作为视觉编辑器入口，直接从产品导航和路由中移除，不保留旧页面和旧导航入口。遗留链接只能由统一路由层返回明确的失效/迁移结果或指向新的项目 Editor，不得继续显示“站点还没有创作基线”这类误导用户的状态文案。

## 十六、首个可验收实施切片

### 1. 第一条端到端主链路

第一阶段的第一个可验收版本必须跑通：

```text
Workspace Thread 输入 brief
  → Coordinator 生成 Plan
  → 用户确认 Plan
  → Build 创建 Project、Sitemap 和 Wireframe
  → 进入 /projects/{projectId}/editor
  → 用户编辑并保存
  → 刷新页面后恢复相同结果
```

该切片暂不要求一次完成所有 Design、Preview、域名和生产发布能力，但必须使用真实 AI 执行、真实持久化和真实编辑器状态，不能用静态 Mock 代替。

### 2. 验收方式

验收由三部分组成：

- 固定的真实建站 brief、工具调用、持久化、失败、恢复和编辑器交互验收脚本；
- Playwright 端到端测试，覆盖从 Workspace Thread 到 Editor、刷新恢复和关键用户操作；
- 必要的人工体验验收，用于判断 AI 对话是否自然、信息架构是否易懂、所见即所得是否成立。

自动化测试不能只验证页面是否渲染成功，还必须检查可观察的运行状态、错误呈现、项目和内容实际写入，以及刷新后的结果一致性。

### 3. 旧数据清理时机

在新主链路的数据库模型和最小流程稳定后，先在开发/测试环境清空旧数据，再开始正式验收。清理动作必须记录范围和结果，避免旧项目、旧 Builder 状态或旧执行路径干扰新流程判断。

## 十七、Coordinator、Agent 与 AI 操作交互决策

### 1. Coordinator 主入口与显式 Agent 发言

Coordinator 是默认主对话入口，负责理解任务、规划和自动调用适当的 Agent/Skill。用户同时可以通过现有 `@` 弹窗手动指定专业 Agent。

无论 Agent 是自动委派还是用户手动 `@`，最终消息都必须显式显示实际发言 Agent 的身份，不能把所有专业输出伪装成 Coordinator 自己说的话。线程仍由 Coordinator 维护整体上下文和任务连续性，避免多个 Agent 各自形成互不关联的临时状态。

Skills 是 Agent 可调用的结构化能力，Agent 是具有明确身份、职责和工具权限的执行者；产品模型和界面文案不得混用这两个概念。

### 2. AI 操作确认规则

- 首次 Build 必须在 Plan 后由用户明确确认；
- 编辑器内普通局部修改直接执行，并进入撤销/重做栈；
- 整页、整站、发布、删除、权限和外部集成等高影响操作必须二次确认；
- 系统必须在确认前说明操作对象和影响范围，而不是只显示通用“是否继续”。

### 3. AI 失败呈现

AI 操作失败时，对话中显示人话版失败原因、失败阶段和可执行的重试或恢复操作。请求、工具参数、错误代码和技术日志放在可展开的详情区域。失败状态必须持久化，刷新后仍可查看和恢复，不能用成功消息覆盖失败事实。

## 十八、Agent 委派、身份与权限决策

### 1. 手动 `@Agent` 的作用范围

用户通过 `@` 指定的 Agent 只负责当前消息。Agent 回复后，下一条未指定 Agent 的消息重新由 Coordinator 接收。`@Agent` 不创建独立子会话，也不静默改变整个 Thread 的默认负责人。

### 2. 自动委派的界面呈现

Coordinator 自动委派时，界面显示简洁、可理解的过程提示，例如“Coordinator 已委派给 SEO Agent”，随后由实际执行的 Agent 署名回复。界面不展示内部思维、隐藏提示词或冗长的 Agent 间通信日志。

Thread 中每条 AI 消息必须保留发言 Agent、委派来源、使用的 Skills 和关联 Run，以便刷新恢复、审计和问题定位。

### 3. Agent 工具与权限

每个 Agent 只能使用其职责所需的工具，并继承当前用户、Workspace 和项目权限。后台自动委派不得提升权限，也不得绕过操作确认、事实来源、数据范围和发布规则。权限不足时必须返回明确错误，由 Coordinator 向用户说明，而不是改用权限更高的执行路径。

## 十九、内容库与专业 CMS 能力决策

### 1. 简单入口，专业能力

项目只保留一个“内容”入口，内部按 Pages、Articles、Reusable Sections 分类，避免把内容模型、集合、字段和页面编辑拆成难以理解的一级菜单。但底层能力不能停留在简单建站工具：内容库必须支持状态、草稿、发布、归档、筛选、批量操作、SEO 元数据、媒体关联、引用关系和审计信息。

“内容模型”不作为普通项目一级导航；首版模型规则和字段管理应在内容库上下文中以清晰的配置入口呈现，避免用户被数据库术语阻塞。

### 2. 页面与内容库的职责

页面上的标题、文案、图片和 Section 内容主要在可视化编辑器中直接编辑；内容库负责批量管理、状态、SEO、关联关系和集合型内容。两处必须使用同一数据源，不能出现编辑器和内容库各自保存一份内容。

### 3. 首版模型与下一版自由建模预埋

首版固定 `Page`、`Article` 和 `Reusable Section` 的核心语义，允许增加自定义字段，但不允许删除或重定义系统必需字段。

数据模型、字段定义、校验、关系、查询和渲染契约必须按未来完全自由内容模型设计边界，不能把首版固定模型硬编码成无法扩展的特殊分支。下一版应能够在不重做页面渲染和编辑器基础设施的前提下，支持用户创建自定义集合、字段类型和内容关系。

## 二十、CMS 状态、多语言与关系决策

### 1. 内容状态

首版内容状态只包括：

- `Draft`：编辑中的内容，不进入生产发布；
- `Published`：当前生产环境可用的内容；
- `Archived`：不再作为当前内容使用，但保留历史记录和引用检查。

首版不引入独立的 `In Review` 审批状态。发布仍需由用户明确触发，系统在发布前执行内容完整性、引用、语言和阻塞项检查。

### 2. 多语言

首版直接支持完整多语言内容管理、翻译编辑和按语言发布。页面、Article、Reusable Section 以及 SEO 元数据都必须具备 locale 维度；不同语言内容应能分别保存、预览和发布，不能把翻译文本拼接进同一个不可区分的字段。

### 3. 内容关系

首版支持受控内容关系，例如 Article 与 Author、Category、Tag、Media 的引用。关系使用稳定 ID 和明确的目标模型，不只保存展示文本；删除或归档被引用内容时，系统必须显示影响范围并阻止产生悬空引用。

## 二十一、媒体、SEO 与发布决策

### 1. 统一媒体库

提供项目可用的统一 Media Library，支持文件上传、文件夹或筛选、Alt Text、标题、版权信息、尺寸、格式和派生图片。可视化编辑器与内容库必须引用同一媒体资源，不能为每次页面上传创建不可管理的孤立副本。

媒体字段和 Alt Text 支持 locale；图片变换、裁切和响应式派生应保留原始资源与变换参数，避免不可逆覆盖。

### 2. 完整 SEO 能力

Page 和 Article 按语言支持：

- SEO Title 与 Description；
- locale-aware Slug；
- Canonical URL；
- Open Graph 与分享图片；
- 结构化数据；
- 搜索结果和社交分享预览。

AI 可以生成和检查 SEO 内容，但用户可以手动编辑；AI 生成结果不得覆盖用户已确认的字段。

### 3. 立即与定时发布

发布支持立即发布和定时发布，并允许按语言选择发布范围。发布前显示受影响的页面、内容、语言、域名和阻塞项。定时任务必须持久化执行状态，并明确显示等待、运行、成功或失败；失败不能被静默跳过。

## 二十二、组件库、AI 生成与 Remix 决策

### 1. 官方组件库与 AI 变体

首版提供官方维护的响应式组件和 Section Library，并与 Design System 绑定。AI 既可以直接组合和配置官方模板，也可以基于现有模板创建新的结构或视觉变体。

这里的 `Remix` 指“以已有组件或 Section 模板为基线生成变体”，不是 Remix Web Framework。Remix 后的结果必须保留来源模板、变更内容和兼容约束，使用户能够理解它从哪里来，并继续在可视化编辑器中修改。

### 2. AI 生成边界

AI 可以：

- 组合官方组件和 Section；
- 调整模板结构、布局、内容槽位和 Design System 变量；
- 基于现有模板 Remix 出新变体；
- 将用户确认的结果保存为 Reusable Section 或项目模板。

AI 首版不直接生成无法由编辑器理解和维护的任意前端代码。所有生成结果都必须符合组件契约、响应式规则、内容槽位模型和所见即所得渲染要求。

### 3. 自定义代码组件

首版不开放 React/CSS 等任意代码组件上传，但底层保留组件注册、版本、Schema 和兼容性接口，为后续专业开发者组件能力预留。预埋不能以首版同时维护代码沙箱和任意运行时为代价。

## 二十三、Remix 变体生命周期

### 1. 变体归属

Remix 结果默认属于当前项目，不自动进入 Workspace 公共库。用户明确执行“保存为 Reusable Section”或“保存为模板”后，才提升为 Workspace 级可复用资产，并需要显示其来源和适用范围。

### 2. 来源与同步

每个 Remix 变体保留来源模板、生成时间、变更摘要和兼容约束，但成为可独立编辑的变体。原模板后续更新不得静默覆盖项目中的变体；系统可以提供手动比较、选择性同步和冲突提示。

### 3. 可修改范围

Remix 允许调整结构、布局、内容槽位、样式变量和组件组合，但必须继续遵守响应式规则、组件契约、内容模型和所见即所得渲染要求。无法稳定映射到真实网站结构的修改必须明确拒绝并说明原因。

## 二十四、组件与模板库治理

### 1. Library 体验

组件和 Section Library 提供分类、搜索、筛选、响应式预览、添加到页面、Remix 和保存为资产等完整操作。用户应能在插入前理解组件的结构、可配置字段、响应式行为和所需内容槽位。

### 2. 官方模板版本

官方模板使用明确版本。项目使用某个模板后保持当前版本，官方后续更新不得自动同步到已有项目；用户可以主动比较、查看变更并选择性同步。同步操作必须经过影响范围检查，不能覆盖项目已经修改的变体或内容。

### 3. Workspace 资产管理

用户保存的模板和 Reusable Section 进入 Workspace Library，支持命名、分类、预览、权限控制、归档和再次 Remix。资产默认遵循 Workspace 权限，不自动公开到其他 Workspace，也不因单个项目的局部修改而改变公共资产。

## 二十五、团队协作与审计决策

### 1. Workspace 角色与资产权限

首版提供 Owner、Admin、Editor、Viewer 四类 Workspace 角色。模板、Reusable Section 和其他 Workspace 资产默认继承 Workspace 权限，不在首版引入复杂的单资产权限矩阵。发布、删除、外部集成和权限变更等高影响操作必须由具备相应角色的成员执行。

### 2. 多人编辑与冲突

首版支持多人查看和基本协作。编辑器自动保存并检测并发冲突；发生冲突时必须提示涉及的对象、操作者和时间，并让用户选择保留、合并或重新应用变更，不允许后写入静默覆盖先前修改。首版不要求完整实时协同光标和多人同时拖拽。

### 3. 协作审计

审计记录项目、内容、资产、发布、权限和 AI 操作等关键活动，包括操作者、时间、目标对象、结果和失败原因。不记录每一次鼠标移动或每个画布像素事件；审计信息服务于协作追踪、故障排查和安全责任，而不是制造噪声。

## 二十六、分对话实施任务拆分

后续实施按以下顺序拆分为独立对话。每个对话只处理一个阶段，完成验收后再开启下一阶段，避免在同一上下文中同时修改 AI、编辑器、CMS 和后台。

### 对话 1：现状基线与旧数据清理准备

范围：确认当前分支、应用/API 入口、旧项目数据、旧路由、测试状态和 GitNexus 影响范围；制定开发/测试环境清理清单。

禁止：不修改产品行为，不开始新功能开发。

验收：输出真实现状报告、清理边界和后续阶段依赖；确认旧数据尚未误删。

调查报告：[`阶段 1 现状基线与旧数据清理准备报告`](./ai-builder-phase-1-baseline-and-legacy-data-cleanup-readiness-report.md)

### 对话 2：统一 AI 建站运行时

范围：Coordinator、Workspace Thread、Plan Run、Build Run、Typed Tool、Agent delegation、`@Agent`、权限、失败恢复和幂等执行。

目标链路：brief → Plan → 用户确认 → Build Run；Build 前不得创建 Project。

禁止：不重做视觉画布，不重做 CMS，不接入 CLI。

验收：Playwright 验证中文 brief、Plan 确认、真实 Build、失败/恢复、刷新恢复和 Agent 发言标识。

### 对话 3：Project/Site/Builder baseline 初始化

范围：Project、Site、Preview Environment、Design System assignment、Page/Reusable Section/Article 基础、ContentStructureRevision、SiteRevisionManifest 和 Builder bootstrap。

目标：新 Build 创建真实可编辑草稿，直接进入 Project Editor，不再出现“站点还没有创作基线”。

禁止：不实现自由画布，不处理生产发布和自定义域名。

验收：新项目能打开 Sitemap；刷新、断流、取消和部分失败均返回服务器真实状态。

### 对话 4：Sitemap 与 Wireframe 编辑器

范围：统一 `/projects/{projectId}/editor`、Sitemap 页面树、Wireframe 自由画布、选区、拖拽、缩放、属性面板、Sitemap→Wireframe 同步、自动保存和撤销/重做。

目标：DOM/CSS 所见即所得，画布对象映射到真实页面、Section、组件和内容槽位。

禁止：不引入任意代码组件，不做第二个 `/content/site-builder` 编辑器。

验收：Playwright 验证页面结构调整、局部 AI 编辑、保存、刷新恢复、并发冲突和撤销/重做。

### 对话 5：Design System、官方 Library 与 Remix

范围：Workspace 默认 Design System、项目级受控覆盖、官方组件/Section Library、搜索筛选预览、Remix 变体、来源追踪、版本和 Workspace 资产保存。

禁止：不开放 React/CSS 任意代码上传，不做自动覆盖已有项目的模板升级。

验收：模板插入、Remix、保存为 Reusable Section、项目覆盖与 Workspace 默认系统之间的边界可验证。

### 对话 6：内容库与专业 CMS

范围：Pages、Articles、Reusable Sections、媒体、内容状态、批量操作、引用关系、Draft/Published/Archived、多语言内容和内容库/编辑器同一数据源。

目标：内容入口简单，但具备专业 CMS 的集合、关系、SEO 和内容运营能力；为下一版自由内容模型保留 schema 扩展契约。

禁止：不在首版开放完全自由内容模型，不提供数据库管理页。

验收：多语言 Article、媒体关系、归档引用检查、编辑器修改与内容库同步、内容状态和 SEO 字段均有自动化验证。

### 对话 7：Preview、域名、环境与发布

范围：默认预览地址、预览/生产目标、自定义域名、DNS/SSL 状态、发布 readiness、立即发布、定时发布、失败恢复和审计。

禁止：不自动发布，不要求自定义域名阻塞创作，不把环境变量和底层部署字段放入普通项目导航。

验收：预览与生产使用同一渲染路径；发布前阻塞项、按语言发布、定时任务和失败状态可验证。

### 对话 8：Knowledge、官方/自定义 Skills 与上下文可见性

范围：Workspace Knowledge 来源、provenance、选择/排除、官方 Skills、自定义 Skills、Coordinator 自动调用、`@Agent` 和结果归因。

禁止：不把 Skill 管理变成普通用户必须理解的 Prompt 编辑器，不允许自定义 Skill 绕过权限或发布检查。

验收：Plan、Build 和编辑器均能显示实际使用的 Knowledge、Skill、Agent 和影响结果。

### 对话 9：开发者分区与 Platform Console

范围：个人设置浮层中的 Developer 分区（API、Webhook、令牌、集成）以及最后阶段的 Platform Console（组织、Workspace、成员、账单、Feature Flags、健康、审计）。

禁止：不把 API、数据库、CLI 放回普通项目主导航，不在 Platform Console 重复管理项目内容。

验收：开发者能力有真实使用场景、权限和风险说明；Platform Console 按运营对象、状态、影响范围、操作进度和历史组织。

### 每个对话的统一结束条件

每阶段结束前必须：

- 更新相关 `docs/spec/**` 合同；
- 运行受影响的静态检查和 Playwright/焦点测试；
- 检查真实错误、部分成功、取消、刷新恢复和权限边界；
- 运行 GitNexus 变更检测；
- 在本方向文档追加已完成事项、未决问题和下一阶段入口。

各阶段可直接复制的独立对话 Prompt 见 [`ai-builder-implementation-prompts.md`](./ai-builder-implementation-prompts.md)。

### 阶段 4 实施记录（2026-08-09）

已完成统一 Editor 的一条真实结构编辑切片：Sitemap 页面拖拽排序和
Wireframe Section 拖拽排序都通过当前 Site Revision 的 typed ChangeSet
Preview/Apply 写入，成功后重新读取 canonical revision；Wireframe 增加了
受边界约束的 DOM/CSS 缩放控件，旧 `/content/site-builder` 直达入口改为迁移
到 `/projects/{projectId}/editor`。

当时尚未完成的阶段 4 验收项已在后续追加记录中逐项收敛。本切片没有引入
本地假数据、静默 rebase 或自动 Apply。

### 阶段 4 追加实施记录（2026-08-10）

本轮将 Wireframe 布局收敛为可持久化的语义合同：`layout` 与
`responsiveLayouts` 随 `WireframeDocumentV1` 保存，由 `wireframe.set_layout`
通过服务端 ChangeSet Preview/Apply 写入。Render Document 和共享
`SiteRenderer` 现在读取同一布局值，在 DOM/CSS section frame 中应用宽度、
对齐、间距、网格列数和断点覆盖；Inspector 也展示 canonical 值。

并发冲突面板保留最近一次 Sitemap/Wireframe typed intent。用户选择刷新时，
编辑器读取最新 Site Revision，只更新 draft-version pin 后重新 Preview；
选择放弃才会清除 intent。Sitemap 额外提供明确的“检查并同步 Wireframe”入口，
跳转到同一页面的 Wireframe 场景，不在客户端静默改写下游结构。

新增冲突组件测试、渲染布局往返测试和阶段 4 Playwright 场景；真实浏览器
场景需要本地 `LOCAL_E2E_PROJECT_ID`，缺少该上下文会明确跳过。服务端现在提供
受限的 `revision.restore` target ChangeSet：Preview/Apply 会在同一事务中恢复仍保留
的内容版本、presentation、binding、层级、路由和规划，并保留当前操作者来源。
已删除实体、Design System 变更、缺失历史版本或缺失内容类型会返回明确需要处理的
问题；删除前会保留内容聚合快照，恢复时重建内容版本、展示文档、绑定、SEO、路由
和层级。恢复仍受当前站点与设计系统范围约束，不会把已删除模型伪装成可用内容。

### 阶段 4 历史读取追加（2026-08-10）

Editor 现在通过真实的 `GET /projects/{projectId}/builder/history` 读取不可变
Builder revision 历史，支持服务端分页游标、当前 revision 标识和明确的
`restore_capability` 状态。对于存在 `base_revision_id` 且目标聚合仍完整保留的当前
Revision，前端可发起真实 `revision.restore` Preview 并进入审阅；不会把历史读取
误报为撤销成功。

无效历史游标返回明确错误。Undo 和 Redo 都使用服务器返回的
`undo_target_revision_id` / `redo_target_revision_id`，统一遵循 Preview → Review → Apply；
restore lineage 持久化 source/target 关系，刷新后仍能继续撤销或重做。已删除实体、层级、
路由、内容类型或历史版本不完整时，恢复会保留明确的服务端问题，不添加本地回退、
客户端逆操作或静默恢复。

阶段 4 的同步状态继续遵循 checkpoint → Preview → Apply → canonical reload：顶栏明确区分已保存、
正在生成预览、需要确认、正在保存版本、冲突和失败。Durable checkpoint 表示草稿已可恢复，
不表示站点版本已经应用。
Builder 专用 draft checkpoint/autosave contract 已落地：Sitemap、Wireframe、Design、样式指南刷新、
新增页面、共享区块以及 AI 候选应用都会先写入 durable checkpoint，再生成服务端 Preview；Apply 成功
后丢弃 checkpoint。刷新会重新预览未应用草稿，保存版本冲突会暴露冲突状态并保留 typed intent，
等待用户刷新或放弃，不静默覆盖其他操作者的草稿。真实浏览器场景使用每次运行唯一的页面路径，
并验证 checkpoint 写入、服务端 Revision 推进、精确页面顺序、Builder/Revision 身份一致、
Undo/Redo、双上下文冲突以及刷新后的已同步状态。

### 阶段 4 闭环追加记录（2026-08-10）

阶段 4 已完成统一 Editor 的 Sitemap/Wireframe 主流程闭环：DOM/CSS 画布、页面与区块层级、
拖拽排序、缩放、对齐、属性与响应式布局值都通过同一 Site Revision 的 typed ChangeSet 持久化；
Sitemap 到 Wireframe 提供明确的检查并同步入口。自动保存不再把 Preview 当作保存结果，而是以
checkpoint 作为刷新恢复与冲突检测的事实来源。

服务端 restore target 现在由 caller-owned 单事务执行，删除前保存内容聚合 retention 快照，
恢复覆盖 ContentItem、ContentVersion、presentation、component binding、SEO、route binding 和
hierarchy node，并写入 restore lineage。真实本地 Playwright 已通过两条场景（新增页面与排序、
草稿恢复与 Undo/Redo/双上下文冲突），同时 API 焦点测试覆盖 restore blocker、ChangeSet apply、
渲染布局、历史游标与 Wireframe 规则。

仍需保持显式限制：任意像素绝对定位、任意代码组件和第二个 site-builder 编辑器不在首版范围；
AI 生成候选仍必须经过当前页面/目标范围与服务端 ChangeSet 审阅，失败或冲突不得显示为成功。
