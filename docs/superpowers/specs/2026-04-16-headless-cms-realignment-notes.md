# Headless CMS 方向校准与外部研究基线

日期：2026-04-16
状态：研究基线 v2
用途：记录当前产品判断、仓库现状、Sanity 官方文档研究结论，以及后续 design spec 需要回答的核心问题。

## 1. 当前判断

Arclayer 当前最需要完成的是一条清晰、完整、商业可用的 `Headless CMS` 主线。

这条主线的优先顺序是：

1. `Headless CMS Core`
2. `Delivery / Preview / GraphQL / SDK`
3. `Visual Editing Layer`

这条顺序的原因很直接：

- 可视化编辑层依赖稳定的数据模型、路由合同、版本语义、查询能力和交付能力。
- GraphQL 和 SDK 的长期可维护性依赖一个稳定的 schema 与内容合同。
- 内容系统先收敛基础层，产品扩展空间会更大，后续构建页面编辑、可复用区块、邮件模板、项目代码集成都会更顺。

## 2. 这轮调整的根因

此前的愿景是 `More than CMS` 的 `Content OS`。这个愿景仍然成立，目标也依然有吸引力：

- 文章
- 页面
- 可复用区块
- 邮件模板
- 其他业务内容资产

当前真正需要调整的是落地顺序与产品叙事。

此前的问题集中在两点：

- 目标层级拉得很高，基础内容合同与产品心智还没有完全收敛。
- 内容创建、内容建模、编辑入口、交付边界仍然混在同一层叙事里。

后续方向应当把“内容核心”当成一级产品，把“可视化编辑”当成消费内容核心的上层产品。

## 3. 外部研究：Sanity 给出的高价值信号

这轮外部研究优先参考了 Sanity 官方文档。Sanity 给出的关键信号很强，也很适合当前阶段的 Arclayer。

### 3.1 Dataset 是数据边界，不是展示概念

Sanity 把 dataset 定义为项目内的数据容器。文档、资源和引用关系首先成立在 dataset 这个边界之内。数据可见性、环境切换、查询范围、权限边界都和 dataset 直接相关。

这条设计的产品价值很高：

- 用户能理解自己在操作哪个数据空间。
- 交付、预览、查询、权限都能围绕一个清晰边界展开。
- 多环境、多项目、多站点的能力可以建立在统一抽象之上。

对 Arclayer 的启发是：

- `workspace`、`project`、`dataset`、`runtime` 需要明确分层。
- 用户感知层可以是“项目空间”。
- 系统边界层需要有比“workspace”更精确的数据容器概念。

### 3.2 Schema 既定义内容，也定义编辑体验

Sanity 的 schema 系统有两个非常重要的产品效果：

- 它定义 document type、field、reference、validation、preview 等内容合同。
- 它直接驱动 Studio 里的内容编辑表单与创建体验。

这意味着 schema 在 Sanity 里同时承担三种职责：

- 数据建模职责
- 编辑器驱动职责
- API 合同源职责

对 Arclayer 的启发是：

- `ContentModel` 必须是正式的一等核心。
- 模型层不只是在 backend 里存一份结构定义，它要成为创建流、编辑器、GraphQL、SDK 的共同源头。
- 后续如果做 visual editing，visual schema 也应当建立在统一内容模型之上。

### 3.3 Preview / Published 是查询视角能力

Sanity 用 `perspectives` 处理 preview、published 等不同查询视角。这是一个非常值得吸收的设计。

这条机制的价值在于：

- Preview 不是临时页面状态，而是正式的查询语义。
- 已发布内容和草稿内容的读取逻辑可以统一到同一查询层。
- 前端集成时更容易建立稳定的 preview contract。

对 Arclayer 的启发是：

- Preview 应当是 `Delivery API / GraphQL / SDK` 的正式能力。
- `draft / published / scheduled / preview` 的视角需要出现在查询层合同里。
- 当前内容系统里的版本、发布、路由、预览能力需要从一开始就围绕正式 query semantics 来定义。

### 3.4 新手体验依赖模板、结构化导航和受控创建流

Sanity 用 Studio structure、document lists、initial value templates、模板化新建入口来帮助用户进入系统。用户感受到的是“我先选一种内容，再进入已经组织好的编辑空间”，而不是“我先自己设计一套抽象系统”。

这直接命中了你提出的两个痛点：

1. 用户上手时不知道第一步做什么。
2. 用户没有架构经验，很难先凭空设计出模型。

对 Arclayer 的启发是：

- `ContentModel` 依然要存在。
- 新用户的第一步入口应该先是“从官方类型或模板开始”，再进入模型细化。
- `Models` 页的职责应当是 schema authoring 和 model governance。
- `Create` 页的职责应当是从模板、官方内容类型、已有模型中启动一条清晰创建流。

### 3.5 引用关系和跨边界关系需要非常明确的规则

Sanity 对 references、cross-dataset references、GraphQL 支持范围都有明确边界。边界一旦清晰，产品语义和 SDK 行为都会清楚很多。

对 Arclayer 的启发是：

- 内容关系设计需要尽早明确“同 dataset 内关系”和“跨 dataset / 跨 project 关系”。
- GraphQL、SDK、delivery layer 需要围绕这些边界定义能力。
- 关系模型、查询模型、预览模型、发布模型需要一起设计，避免后期出现补丁式兼容层。

### 3.6 GraphQL 是严格投影层，不是内容核心本体

Sanity 官方 GraphQL 文档给出三个很重要的信号：

- GraphQL schema 来自 studio schema 的生成与部署。
- GraphQL 比 Studio schema 更严格，部分灵活 schema 写法需要提升为顶层命名类型。
- GraphQL 更适合查询层；mutation 仍然走独立 mutation API。

这给 Arclayer 的直接启发是：

- GraphQL 需要建立在稳定的 `content contract` 或 `delivery contract` 之上。
- GraphQL 的位置更像正式对外查询层，而不是内容系统最底层真相。
- 如果后续需要商业可用 SDK，管理写入、内容交付、预览读取很可能需要分层，而不是把所有能力都塞进一个 GraphQL 入口。

### 3.7 Workspace 和 Dataset 是两层不同抽象

Sanity 的 `workspaces` 文档和 multi-tenancy 指南给出了一个非常关键的认知：

- `workspace` 是 Studio 内的配置切面。
- 不同 workspace 可以指向不同 dataset，也可以共享 schema。
- workspace 解决的是“编辑空间如何组织与切换”。
- dataset 解决的是“内容数据存在哪里、按什么边界查询和授权”。

这条区分对 Arclayer 很有价值。

它意味着后续设计需要避免把以下两件事混为一谈：

- 用户在管理后台里看到的“工作空间”
- 系统内部真正承载内容数据和 API 查询的“数据边界”

Arclayer 目前的 `workspace` 已经同时承担协作、权限、站点、内容、设置等职责。后续 spec 需要判断：

- 当前 `workspace` 是否直接充当 dataset
- 当前 `workspace` 是否应该承载多个 project / dataset
- 用户感知的项目空间是否应该是 `project`
- dataset 是否应当成为 project 下的环境或数据分片

### 3.8 管理写入路径需要正式验证链

Sanity 官方文档对 schema validation 给出的边界也很有价值：

- Studio 内会运行编辑体验相关的 validation。
- 通过 HTTP API、client library、import、migration 写入数据时，数据层并不会天然复用所有 Studio validation。

这条边界对 Arclayer 非常重要。

它意味着：

- `Model validation` 需要区分编辑器提示和服务端准入规则。
- 商业级 `management SDK` 不能只信任前端表单。
- 如果后续允许脚本、API、CLI、agent、外部系统直接写入内容，服务端必须有正式的 model-aware validation pipeline。

这会直接影响：

- content management API 设计
- SDK 设计
- migration 设计
- bulk import 设计
- visual editor 和 structured editor 的一致性策略

## 4. 当前仓库真相

当前仓库的内容系统并不是空白状态。它已经长出一批核心合同和半成品产品面。

### 4.1 已经存在的核心合同

`apps/api/src/modules/workspaces/content/contracts/schema.py` 已经定义了这批正式内容合同：

- `ContentModel`
- `ContentItem`
- `ContentVersion`
- `ContentPresentation`
- `ContentRelation`
- `ContentRoute`
- `ContentView`

这条线和之前收敛过的概念模型是一致的。

### 4.2 已经存在的 backend surface

当前 backend 已经存在一套 canonical content routers，包括：

- `content/models`
- `content/items`
- `content/presentations`
- `content/routing`
- `content/views`
- `content/seo`

这说明内容核心的 API 合同已经有雏形，当前问题更集中在产品心智、页面 IA、创建流、能力边界与长期架构顺序。

### 4.3 已经存在的 frontend surface

当前 admin 已经存在这些页面：

- `/content/library`
- `/content/create`
- `/content/models`
- `/content/site-builder`
- `structured` surface
- article editor

当前真实情况是：

- `Content Library` 已经具备工作台雏形。
- `Models` 页仍处于半成品状态，承载了很多未收敛的叙事。
- `Create` 页还没有建立清晰的产品心智。
- article editor 已经具备一定成熟度。
- page builder 仍然是调试级 shell。

## 5. 当前产品痛点的更深一层解释

### 5.1 痛点一：用户不知道从哪里开始

这不是一个简单的空状态文案问题。

它本质上是这三个问题没有被产品化解决：

- 第一层对象是什么
- 第一层动作是什么
- 第一层成功感是什么

如果用户进入系统后先看到的是抽象 schema、capability、surface、route、view，他们会感受到复杂度。用户会希望先完成一个真实结果，例如：

- 创建一篇文章
- 创建一个页面
- 创建一个作者档案
- 创建一个可复用 Section

后续系统需要围绕“先得到结果，再逐步上升到建模层”来组织体验。

### 5.2 痛点二：用户没有建模能力

这不是用户教育问题，这是产品职责问题。

内容系统需要提供一套官方内容原型与渐进式建模路径，例如：

- Article
- Page
- Author
- Category
- Reusable Section
- Email Template
- Product Detail

用户可以从官方类型开始，再逐步进入：

- fields
- relations
- routing
- workflow
- views
- presentation

这意味着 Arclayer 需要同时提供两层能力：

- `opinionated starter models`
- `open-ended schema authoring`

### 5.3 痛点三：capabilities 当前承担了过多叙事职责

当前仓库里 `capabilityPackIds` 已经深度进入内容模型、内容项、surface routing 和 bootstrap state。

这条线说明一件事：

- capability 已经成为产品设计的核心中间层

当前需要回答的问题是：

- capability 是否应该继续作为用户可感知的一等建模语言
- capability 是否更适合作为模型合同推导出的内部组合结果

基于当前外部研究，初步倾向是：

- 用户面对的一级对象应当是 `model / template / content type`
- capability 更适合作为系统内部能力合同和编辑器 / delivery / runtime 派生层

这条判断需要在正式 spec 中进一步收敛。

## 6. 需要重新定义的四层模型

为了避免后续讨论继续混层，当前建议用四层结构来看这条产品线。

### 6.1 Layer 1: Content Core

这一层负责：

- model definition
- item lifecycle
- versioning
- relations
- routing
- views
- workflow
- seo

这一层是 Headless CMS 的根。

### 6.2 Layer 2: Delivery and Query

这一层负责：

- Delivery API
- Preview API
- GraphQL
- query semantics
- perspectives
- caching
- publish visibility

这一层把内容核心转化成前端和外部系统可消费的接口。

### 6.3 Layer 3: SDK and Project Integration

这一层负责：

- 前端 SDK
- 服务端 SDK
- 类型生成
- query client
- webhook / event integration
- 项目脚手架与代码接入方式

这一层决定 Arclayer 是否具备商业可用的开发者体验。

### 6.4 Layer 4: Visual Editing

这一层负责：

- page composition
- section placement
- bindings
- visual canvas
- editor shell
- design-time interactions

这一层消费前面三层形成的合同，不承担内容基础层的收敛职责。

## 7. Dataset / Workspace / Project / Runtime 的待定结构

这是当前最大、也最影响长期架构的一组问题。

### 7.1 当前目标

你希望用户拥有类似这类体验：

- 平台域名是 `arclayer.io`
- 每个用户工作空间拥有自己的子域
- 用户感受到自己拥有一个完整项目空间
- 这个空间可以有独立数据、独立交付、独立代码和独立运行时

### 7.2 当前需要分开的概念

后续 spec 需要明确区分至少四个对象：

- `Workspace`
- `Project`
- `Dataset`
- `Runtime`

当前一个很强的候选关系是：

- `Workspace` 是协作和计费边界
- `Project` 是用户感知的应用边界
- `Dataset` 是内容和资源的数据边界
- `Runtime` 是交付、预览、域名、部署和执行边界

这组关系当前仍然是研究命题，正式 spec 需要给出最终答案。

### 7.3 这条议题为什么要在 Headless CMS 阶段就提前定义

原因很明确：

- GraphQL 的租户边界依赖它
- SDK 的初始化与认证依赖它
- content delivery 的 host resolution 依赖它
- preview / publish / environment model 依赖它
- 用户项目代码如何接入平台依赖它

## 8. 初步产品结论

结合当前外部研究和仓库真相，Arclayer 这条主线的高价值方向已经更清晰了。

### 8.1 Arclayer 的第一份正式 spec 应该聚焦 `Headless CMS Core`

原因是它会决定：

- model contract
- item contract
- version contract
- relation contract
- route contract
- view contract
- workflow contract
- capability position

### 8.2 `GraphQL / SDK / Dataset Runtime` 需要在这份 spec 里被定位

这几条线需要在第一份 spec 里明确：

- 依赖关系
- 输出合同
- 预留字段
- 后续 phase 边界

这样后面的设计不会漂移。

### 8.3 `/content/models`、`/content/create`、`/content/library` 需要围绕新心智重构职责

当前一个更健康的职责方向是：

- `Models`：Schema IDE、模板治理、模型治理、合同检查
- `Create`：从官方类型、模板、已有模型启动创建流
- `Library`：内容项工作台、版本、状态、视图、批量管理

这部分还需要正式设计确认。

## 9. 这份研究基线之后需要回答的问题

后续 design spec 需要围绕下面的问题推进：

1. `Headless CMS Core` 的最小完整范围是什么。
2. `ContentModel / ContentItem / ContentVersion / Relation / Route / View` 的正式边界是什么。
3. `capability` 在产品层和系统层分别承担什么职责。
4. `official content types / starter templates / custom models` 三者如何共存。
5. `Create` 流的第一步应该从模板开始、从模型开始、还是从结果开始。
6. GraphQL 是直接从模型合同生成，还是从 delivery contract 生成。
7. SDK 应该围绕 `management`, `delivery`, `preview` 分层，还是围绕前后端运行时分层。
8. `Workspace / Project / Dataset / Runtime` 的正式关系是什么。
9. visual editing 如何消费 content core，而不重新发明第二套内容系统。

## 10. 官方文档参考

这轮研究优先参考了 Sanity 官方文档。后续继续讨论时，建议围绕这些文档继续抽取具体设计信号：

- Datasets: https://www.sanity.io/docs/content-lake/datasets
- Perspectives: https://www.sanity.io/docs/content-lake/perspectives
- GraphQL API: https://www.sanity.io/docs/graphql
- Schema types: https://www.sanity.io/docs/schema-types
- Document types: https://www.sanity.io/docs/document-type
- Structure Builder: https://www.sanity.io/docs/structure-builder-introduction
- Initial value templates: https://www.sanity.io/docs/initial-value-templates
- References: https://www.sanity.io/docs/reference-type
- Cross dataset references: https://www.sanity.io/docs/cross-dataset-references

## 11. 这份文档的定位

这份文档承担四个作用：

- 固化当前主线判断
- 引入外部产品证据
- 记录当前仓库真相
- 为正式 design spec 收敛问题边界

正式 design spec 需要在这份研究基线之上继续给出：

- 产品边界
- 架构边界
- 数据模型
- 页面 IA
- 创建流
- query / preview / publish contract
- GraphQL / SDK 设计
- dataset / runtime 设计
- phase plan

## 12. 历史与已确认结论

这部分用于记录已经讨论并确认过的架构判断，避免后续设计漂移。

### 12.1 组织层

- 当前系统底层仍然是每个用户对应一个组织。
- `organization` 当前主要承担底层账户、billing、plan 等系统职责。
- 用户层当前不直接感知 `organization` 概念。

### 12.2 Workspace 层

- 当前主线继续采用 `workspace-based` 架构。
- 当前判断是：`one workspace = one site`
- `workspace` 当前已经承载完整产品单元，包括资源、内容、网站设置、团队协作和工作区级功能。
- 当前不把 `workspace` 设计成“多个站点 / 多个项目的容器”。

### 12.3 Project 概念

- 当前没有把 `project` 确认为正式一等产品对象。
- 现阶段继续以 `workspace` 作为用户感知的核心对象更符合现有架构和产品面。
- 后续如果引入 `project`，需要它解决一个当前 `workspace` 无法表达的真实问题。

### 12.4 AI 建站分支

- 本轮讨论已经触达 AI 建站、对话草稿、workspace 配额等问题。
- 当前决定是：先把这条分支从主线 spec 里剥离。
- 当前正式主线只聚焦 `Headless CMS Core`、`Delivery / GraphQL / SDK`、`Visual Editing Layer` 的边界与顺序。
- AI 相关入口、额度、草稿会话、materialization 流程可以在后续独立 spec 中处理。

## 13. 第二段正式设计：Page / Route / Binding / Delivery 合同边界

这部分用于定义 Headless CMS v1 的页面解析主干。目标是形成一条稳定、可缓存、可类型化、可被 Backend 直接实现的正式合同。

### 13.1 总体职责划分

`Page Resolve` 在 v1 中承担四件事：

- 根据请求 path 命中一个 `Page`
- 解析静态路由或动态路由参数
- 载入单个 `Primary Record Context`
- 对 `Page` 里的 `Section` 执行 `Server-side Flattening`

`Page Resolve` 的边界也需要保持清晰：

- 它输出“这个页面是什么，以及它需要怎样的数据才能渲染”
- 它输出“已经绑定完成的 Section props”
- 它不承担列表查询、聚合查询、搜索、分页、排序等查询职责

这意味着 v1 的职责拆分是：

- `Page Resolve`：页面身份、模板匹配、单记录上下文、绑定展开、交付 JSON
- `Query API / GraphQL`：列表、过滤、排序、分页、聚合、跨模型查询

### 13.2 v1 的核心对象

为了让 `Page Resolve` 足够稳定，v1 先明确五个对象：

#### 13.2.1 Page

`Page` 是所有路由的唯一真值源，负责：

- route pattern
- route mode
- layout slots
- section composition
- primary source declaration
- seo defaults

#### 13.2.2 Route Pattern

`Page.route` 负责声明页面的路径合同。

v1 支持两种模式：

- `static`
  - 例：`/pricing`
  - 直接命中一个固定页面
- `dynamic`
  - 例：`/blog/:slug`
  - 根据 path params 在绑定的 `Primary Source Model` 中解析单条记录

#### 13.2.3 Primary Source

动态 `Page` 需要声明一个 `Primary Source`，它定义：

- 来源模型，例如 `Article` 或 `Category`
- 参数与字段的绑定关系，例如 `slug -> slug`
- 可见性策略，例如 `public` 读取 published，`preview` 优先 draft

#### 13.2.4 Section Instance

`Page` 引用的是 `Reusable Section` 的实例或变体绑定。每个页面里的 section 节点都拥有：

- section identity
- section type
- props defaults
- props mapping
- visibility rule
- slot placement

#### 13.2.5 Flattened Delivery Document

`pages.resolve(path)` 的最终结果是一份干净的、已经完成数据绑定的交付 JSON。前端消费的是扁平化后的 section props，而不是运行时表达式。

### 13.3 Route Matcher 的优先级策略

路由匹配必须具有确定性。v1 采用三层裁决规则。

#### 13.3.1 第一层：静态路由优先

静态路由拥有最高优先级。

示例：

- `/blog/new`
- `/blog/:slug`

当请求 path 为 `/blog/new` 时，系统始终命中静态页面 `/blog/new`。

这条规则保证：

- 特殊页面拥有稳定入口
- 用户可以在动态集合下声明保留页
- delivery cache key 保持清晰

#### 13.3.2 第二层：动态路由按“结构特异性”排序

当多个动态模式都可能命中时，系统按路由结构特异性排序。

排序规则按优先级从高到低为：

1. 静态 segment 数量更多的模式优先
2. segment 总数更多的模式优先
3. 参数段更少的模式优先
4. 创建时的 route priority 更高者优先

示例：

- `/docs/:slug`
- `/:section/:slug`

请求 `/docs/getting-started` 时，`/docs/:slug` 优先。

#### 13.3.3 第三层：配置期消除歧义

v1 在路由写入阶段直接拒绝“同结构歧义模式”。

示例：

- `/blog/:slug`
- `/blog/:id`

这两条模式的结构签名相同，因此系统在保存时直接报冲突。

建议引入一条规范化签名：

- `/blog/:slug` -> `/blog/:param`
- `/blog/:id` -> `/blog/:param`

一旦签名重复，写入阶段返回：

- `CONTENT_ROUTE_PATTERN_CONFLICT`

这条规则让匹配阶段保持单义性，也让后台治理更直接。

### 13.4 Context Injection 的深度

v1 的动态页面采用 `single primary record context`。为保证交付 API 的确定性，Context Injection 采用 `depth = 1` 的规则。

#### 13.4.1 注入范围

系统注入的 primary context 包含三层内容：

1. Primary Record 的系统字段
   - `id`
   - `model`
   - `slug`
   - `status`
   - `visibility`
   - `locale`
   - `publishedAt`

2. Primary Record 的内容字段
   - 例如 `title`
   - `summary`
   - `content`
   - `coverImage`

3. Primary Record 的一跳关系摘要
   - 例如 `category`
   - 每个关系项可包含：
     - `id`
     - `model`
     - `slug`
     - `title`
     - `name`

#### 13.4.2 深度规则

v1 采用以下深度规则：

- primary record 自身字段：完整可用
- primary record 的直接关系：自动展开到一跳摘要
- 关系对象的再下一跳关系：不进入 v1 resolve 范围

这样一来，以下绑定成立：

- `primary.title`
- `primary.summary`
- `primary.category.name`

以下绑定进入后续 phase：

- `primary.category.parent.name`
- `primary.relatedArticles[0].title`
- `primary.author.organization.name`

#### 13.4.3 这样设计的原因

这条边界同时满足三件事：

- 页面模板常见展示需求可以直接满足
- route resolve 的 payload 保持稳定
- relation recursion、reverse lookup、list hydration 继续留在 query layer

### 13.5 Section Binding 的正式语义

v1 采用 `显式 Props Mapping`。这要求 `Section` 先暴露稳定的 props contract，再由 `Page` 绑定数据来源。

#### 13.5.1 绑定对象

每个 section instance 需要同时拥有：

- `props_defaults`
- `props_mapping`

其中：

- `props_defaults` 存储字面量默认值
- `props_mapping` 存储运行时需要从 context 提取的字段来源

#### 13.5.2 建议的数据结构

为了支持高效的 `Server-side Flattening`，建议把 `props_mapping` 存为结构化 JSON，而不是模板字符串。

建议结构：

```json
{
  "version": 1,
  "props": {
    "title": {
      "kind": "context_path",
      "source": "primary",
      "path": ["title"]
    },
    "eyebrow": {
      "kind": "context_path",
      "source": "primary",
      "path": ["category", "name"]
    },
    "coverImage": {
      "kind": "context_path",
      "source": "primary",
      "path": ["coverImage"]
    }
  }
}
```

#### 13.5.3 这个结构的优点

这个结构支持四个关键目标：

- 后端可以直接按数组路径取值
- 模型治理层可以静态分析依赖关系
- 字段重命名时可以做影响检查
- flattening 结果保持稳定、可缓存、可测试

#### 13.5.4 v1 支持的 mapping kind

v1 先支持两种 mapping：

- `context_path`
  - 从 `primary` context 中读取某个路径
- `literal`
  - 直接提供固定值

建议的 `literal` 结构：

```json
{
  "kind": "literal",
  "value": "Read more"
}
```

#### 13.5.5 v1 的 binding 约束

为了让 v1 足够稳定，binding 层采用以下范围：

- 每个 prop 对应一个 mapping
- 每个 mapping 指向单一路径或单个字面量
- transform pipeline 留到后续 phase
- collection mapping 留到后续 phase
- conditional expression 留到后续 phase

### 13.6 Server-side Flattening 的执行顺序

v1 的 `pages.resolve(path)` 在后端采用固定执行顺序：

1. 归一化 path
2. 执行 route match
3. 命中 `Page`
4. 如果是动态页面，解析 params 并加载 primary record
5. 构造 `context.primary`
6. 读取 page layout 与 section instances
7. 对每个 section 执行 `props_defaults + props_mapping -> flattened props`
8. 返回 `ResolvedPageDocument`

返回结果建议包含：

- `match`
- `page`
- `contextMeta`
- `layout`
- `sections`
- `seo`
- `warnings`

其中 `sections` 是前端最直接消费的部分：

```json
{
  "id": "hero-1",
  "type": "hero",
  "slot": "main",
  "props": {
    "title": "How to build a CMS",
    "eyebrow": "Architecture",
    "coverImage": {
      "id": "asset_123",
      "url": "https://cdn..."
    }
  }
}
```

### 13.7 Delivery 合同边界

v1 的 `pages.resolve(path)` 输出目标是一份可直接渲染的页面文档。

#### 13.7.1 建议的 resolve response 语义

- `public` 模式：
  - 返回已发布且可交付的页面
- `preview` 模式：
  - 优先返回 draft 版本
  - 在 draft 缺失时可回退到 published 版本

#### 13.7.2 建议的顶层数据块

- `match`
  - 页面命中结果
- `route`
  - route pattern、resolved path、params
- `page`
  - page identity、page model、revision info
- `primary`
  - 注入后的 primary record context
- `layout`
  - slots 与 layout binding
- `sections`
  - flatten 后的页面 section
- `seo`
  - 页面 SEO
- `diagnostics`
  - warning 或 preview-only issue

### 13.8 Error Handling 的正式边界

`pages.resolve(path)` 的错误处理需要严格区分四种情况。

#### 13.8.1 路由未命中

场景：

- 没有任何 `Page` 匹配当前 path

建议合同：

- HTTP `404`
- error code: `PAGE_ROUTE_NOT_FOUND`

#### 13.8.2 页面命中，但 primary record 不存在

场景：

- 动态 `Page` 命中
- 对应 `slug` 在 source model 中找不到记录
- 记录已被删除

建议合同：

- `public` 模式：HTTP `404`
- `preview` 模式：HTTP `404`
- error code: `PAGE_PRIMARY_RECORD_NOT_FOUND`

这条规则保证：

- 路由模板存在不等于内容实体存在
- delivery cache 语义保持明确
- 前端和 SDK 很容易区分“页面不存在”和“内容实体不存在”

#### 13.8.3 页面命中，primary record 存在，但当前模式不可见

场景：

- `public` 模式下，primary record 只有 draft，尚未 published
- 或 visibility / publish state 不满足公开交付条件

建议合同：

- `public` 模式：HTTP `404`
- error code: `PAGE_PRIMARY_RECORD_UNAVAILABLE`

在 `preview` 模式下：

- 若 draft 可读取，返回 `200`
- 若 preview 也不可读取，返回 `404`
- error code: `PAGE_PRIMARY_RECORD_PREVIEW_UNAVAILABLE`

#### 13.8.4 页面命中，binding 失败

场景：

- page 与 primary record 都存在
- 某个 `props_mapping` 指向不存在的字段路径
- 某个 required prop 无法展开

建议合同：

- `public` 模式：HTTP `500`
- error code: `PAGE_BINDING_RESOLUTION_FAILED`
- `preview` 模式：HTTP `500`
- diagnostics 中包含失败的 section id 与 prop name

这类错误代表系统配置错误，应当完整暴露，便于修复。

### 13.9 v1 的强约束

为了让后续 Backend 实现足够稳定，v1 需要明确以下约束：

- 一个动态 `Page` 只绑定一个 primary source model
- 一个请求只注入一个 primary record
- context injection 深度固定为 `1`
- `props_mapping` 采用结构化 JSON
- `props_mapping` 的 source 先固定为 `primary`
- route matcher 在写入阶段消除同结构歧义
- delivery layer 只输出 flatten 后文档

### 13.10 这段设计给 Backend 的直接施工信号

Backend 第一阶段可以围绕下面几块展开：

1. `PageRoutePattern` 的持久化与签名冲突校验
2. `RouteMatcher` 的静态优先和动态排序实现
3. `PrimarySourceResolver` 的单记录查找与可见性校验
4. `ContextAssembler` 的 depth=1 注入
5. `SectionBindingResolver` 的结构化路径取值
6. `FlattenedPageDocument` 的输出 schema
7. `pages.resolve(path)` 的正式错误合同

## 14. 第三段正式设计：Admin IA 收敛

这部分用于把前面已经确认的 `System Managed Models`、`Page Resolve`、`Library-first` 逻辑落到后台交互架构上。

### 14.1 当前 UI 真相

当前 Admin 导航的 live repo truth 是：

- 左侧导航已经暴露 `Contents Library`
- 左侧导航已经暴露 `Site Settings`
- `Models` route 已存在
- `Site Builder` route 已存在
- `Models` 和 `Site Builder` 当前都不适合作为 v1 的常设主导航心智

这说明 v1 的 IA 收敛方向不应该是继续扩菜单，而应该是让 `Content Library` 成为内容工作的主平面，把其他能力收成功能切面。

### 14.2 v1 的 IA 主张

v1 采用：

- `Library 为核心`
- `Models 为治理切面`
- `Site Builder 为页面类型的沉浸式编辑切面`

这条 IA 的核心目标是：

- 用户始终先进入内容工作台
- 建模和页面构建都从真实内容工作流触发
- 后台避免形成平行的“内容模块 / 页面模块 / 模型模块”三套割裂体验

### 14.3 Create 入口：去中心化

v1 不在左侧导航里新增独立 `Create` 菜单。

`Create` 动作归属于 `Content Library` 的 header action。

用户流程为：

1. 进入 `Content Library`
2. 点击 `New Content`
3. 打开 overlay
4. 在 overlay 中选择四个官方协议类型：
   - `Article`
   - `Page`
   - `Reusable Section`
   - `Category`

这条设计的意义是：

- “找内容”和“造内容”发生在同一个平面
- 用户不需要先理解模型层
- 官方类型入口保持极短路径

### 14.4 Models：画布治理，而不是表单列表

`Models` 页在 v1 保留，但它不是传统 schema table，也不是通用 JSON 表单编辑器。

`Models` 的定位是：

- 官方协议模型治理面板
- 扩展字段设计面板
- 影响分析面板

点击某个模型后，进入一个 `Node-based Canvas` 建模环境。

#### 14.4.1 画布中的节点语义

- `System Fields`
  - 以锁定节点显示
  - 不允许删除核心协议字段
- `Custom Fields`
  - 允许新增
  - 允许通过节点和连线表达字段、关系、依赖
- `Impact Analysis`
  - 用连线或侧边检查器显示这个字段影响哪些 page bindings、sections、delivery contract

#### 14.4.2 v1 的治理边界

即使使用画布化体验，v1 的能力仍然收紧为：

- 只允许扩展官方模型
- 不开放完全自定义模型
- 不允许破坏系统协议字段

换句话说，`Models` 在体验上是画布，在产品语义上仍然是 `Protocol Governance Surface`。

### 14.5 Site Builder：情境式触发

v1 不把 `Site Builder` 作为左侧常设主导航。

`Site Builder` 是页面类型内容项的沉浸式编辑环境。它的入口来自 `Content Library`。

建议流程：

- 用户在 `Content Library` 点击一个 `Page` 类型内容项
- 系统检查该内容项的交付属性和编辑模式
- 若该页面走 layout / sections / bindings 路径，直接进入全屏 `Site Builder`
- 若内容项走结构化编辑路径，进入对应 structured editor

这条设计保证：

- 页面构建与内容管理是同一条工作流的两个阶段
- 用户始终围绕“内容项”工作，而不是在导航里切换不同宇宙

### 14.6 Admin IA 的 v1 定案

v1 的导航与入口建议收敛为：

- 左侧常驻：
  - `Contents Library`
  - `Site Settings`
- 非常驻但正式存在：
  - `Models`
  - `Site Builder`

它们的触发方式分别为：

- `Models`
  - 从 `Content Library` 顶部 secondary action 进入
  - 或从 `New Content` overlay 中进入“扩展模型”路径
- `Site Builder`
  - 从 `Page` 内容项点击进入

这样一来，Arclayer 的后台主叙事就变成：

- 先内容
- 再治理
- 再构建

## 15. 第四段正式设计：Content Lifecycle / Versioning / Publish Semantics

这部分用于定义 v1 的正式生命周期合同，重点解决：

- draft / published 的 DB 隔离语义
- 模型变更如何不破坏已发布交付
- `pages.resolve` 在不同 perspective 下如何处理引用
- `Site Settings` 在新 IA 下保留哪些系统职责

### 15.1 生命周期的总体原则

v1 采用三个隔离原则：

1. 已发布交付永远只依赖已发布合同
2. 未发布编辑永远只影响 draft 视角
3. 模型治理和内容版本都必须具备可独立发布的边界

这意味着：

- delivery 不读取草稿模型合同
- delivery 不泄漏草稿内容
- preview 才承担“看未发布世界”的职责

### 15.2 DB 层的隔离语义

#### 15.2.1 Content Item 与 Content Version

内容项保持双指针模型：

- `draft_version`
- `published_version`

所有结构化内容、页面内容、section 内容都通过版本号指针切换。

#### 15.2.2 Page Composition 与 Section Binding

`Page` 的 layout、slots、section composition、props mapping 都属于 `Page Version` 的一部分。

这意味着：

- 一个页面的 draft 版可以改 sections、改 mapping、改 layout
- 已发布页面继续读取 published revision 的 composition snapshot
- public delivery 永远不读取 draft composition

#### 15.2.3 Model Governance Revision

由于 v1 允许用户扩展官方模型，模型本身也需要 revision 语义。

建议 `ContentModel` 具备：

- `draft_contract_revision`
- `published_contract_revision`

规则如下：

- 用户在 `Models` 画布里新增字段或改扩展配置时，写入 draft contract revision
- published delivery 继续使用 published contract revision
- 模型 draft 变更只有在正式 publish 后，才会成为新的对外交付合同

#### 15.2.4 这条规则解决的核心问题

这条隔离保证：

- 画布建模中的未发布字段不会破坏现有 Delivery API
- 已发布页面不会突然因为模型画布改动而失效
- SDK 和 GraphQL 可以继续围绕 published contract 建立稳定类型

### 15.3 Publish 的正式语义

v1 需要区分三种 publish 动作：

#### 15.3.1 Publish Content Revision

对象：

- `Article`
- `Page`
- `Reusable Section`
- `Category`

动作：

- 将某个内容项的 draft version 提升为 published version

#### 15.3.2 Publish Model Contract Revision

对象：

- `Article protocol extension`
- `Page protocol extension`
- `Reusable Section protocol extension`
- `Category protocol extension`

动作：

- 将模型 draft contract 提升为 published contract

#### 15.3.3 Publish Safety Gate

v1 需要在 publish 前做正式校验：

- required system fields 是否完整
- page bindings 是否仍然有效
- required section props 是否都能解析
- route pattern 是否仍然合法
- published delivery contract 是否会断裂

如果不满足条件，publish 被阻止，错误显式返回，不做 silent fallback。

### 15.4 Perspective 查询合同

v1 至少支持两种 perspective：

- `public`
- `preview`

#### 15.4.1 public

`public` 的规则是：

- `Page` 读取 published revision
- `Primary Record` 读取 published revision
- `Section` 读取 published revision
- `Model Contract` 读取 published contract revision

`public` 永远不跨到 draft 世界。

#### 15.4.2 preview

`preview` 的规则是：

- `Page` 优先读取 draft revision，缺失时回退 published
- `Primary Record` 优先读取 draft revision，缺失时回退 published
- `Section` 优先读取 draft revision，缺失时回退 published
- `Model Contract` 优先读取 draft contract revision，缺失时回退 published contract

这条规则让预览世界拥有最大可见性，同时保持可回退能力。

### 15.5 Page 已发布，但引用对象仍是 Draft 的降级逻辑

这是 `pages.resolve` 的一个关键边界。

#### 15.5.1 public perspective

场景：

- `Page` 已发布
- 引用的 `Section` 或 `Article` 仍然只有 draft 变更

规则：

- public resolve 只使用引用对象的 published revision
- draft revision 被完全忽略
- 如果引用对象没有任何 published revision，则该引用视为不可交付依赖

建议结果：

- publish 阶段优先阻止这种状态进入已发布世界
- 如果历史脏数据仍然存在，`pages.resolve(public)` 返回：
  - HTTP `409`
  - error code: `PAGE_DEPENDENCY_UNAVAILABLE`

这样能明确暴露“页面已发布，但依赖对象没有可发布版本”的系统问题。

#### 15.5.2 preview perspective

场景相同时，preview 的规则为：

- 优先读取依赖对象的 draft revision
- 若 draft 不存在，则回退 published revision
- 若两者都不存在，则记录 diagnostics warning

只有当该依赖被标记为 required 且缺失会阻断页面结构时，preview 才返回：

- HTTP `500`
- error code: `PAGE_PREVIEW_DEPENDENCY_UNAVAILABLE`

否则 preview 可以带 warning 返回，方便继续编辑。

### 15.6 Site Settings 在新 IA 下的职责

由于 `Header / Footer` 已经作为特殊 `Reusable Section` 实例存在，`Site Settings` 不再承载内容型全局块的编辑职责。

`Site Settings` 在 v1 应保留系统级职责。

#### 15.6.1 保留的职责

- Site identity
  - site name
  - favicon
  - brand metadata
- Domains and host resolution
  - custom domains
  - default hostname
  - canonical host
- Localization
  - locales
  - default locale
  - locale routing policy
- SEO defaults
  - site-wide title template
  - default meta defaults
  - robots / indexing policy
- Preview and delivery controls
  - preview tokens
  - publish visibility policy
  - sitemap / crawl policy

#### 15.6.2 不再保留的职责

以下内容不应继续留在 `Site Settings`：

- Header 正文本身
- Footer 正文本身
- 页面级 section 内容
- 内容型 global block 文案

这些对象都应该回到 `Reusable Section` 和 `Page` 体系中治理。

#### 15.6.3 可保留的“系统绑定”职责

`Site Settings` 仍然可以保留少量系统绑定配置，例如：

- 默认 header slot 指向哪个 section
- 默认 footer slot 指向哪个 section
- site-wide layout policy

但这里存储的是“绑定规则”，不是“内容正文”。

### 15.7 Lifecycle 给 Backend 的直接施工信号

Backend v1 可以围绕下面几块展开：

1. `ContentVersion` 的 draft/published 双指针读写
2. `PageVersion` 内聚 layout/composition/binding snapshot
3. `ContentModelContractRevision` 的 draft/published 双指针
4. publish safety gate
5. perspective-aware resolve
6. dependency availability validation
7. site settings 与 global section binding 的职责拆分
