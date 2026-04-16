# Arclayer Headless CMS v1 Core Design

日期：2026-04-17
状态：已确认设计
范围：Headless CMS Core v1

## 1. 目标

Arclayer v1 先完成一条稳定、商业可用、可交付的 Headless CMS 主线，再在其上叠加 GraphQL、SDK 和可视化编辑能力。

v1 的核心目标是：

- 建立稳定的官方内容协议模型
- 建立可预测的页面解析与交付合同
- 建立 draft / published / preview 的严格隔离语义
- 建立围绕 `Content Library` 的后台主工作流

## 2. 非目标

以下能力不属于 v1 主线：

- AI 建站入口、AI 草稿会话、AI materialization 流程
- 完全自定义模型系统
- 列表查询上下文驱动的动态页面
- 表达式引擎式自由绑定
- 多项目容器式 workspace

## 3. 核心产品边界

### 3.1 顶层对象

当前产品边界采用：

- `organization`
  - 底层账户、billing、plan 壳
- `workspace`
  - 用户感知的一等对象
  - `one workspace = one site`

当前阶段不把 `project` 定义成正式一等产品对象。

### 3.2 主线分层

Arclayer 的内容主线按三层推进：

1. `Headless CMS Core`
2. `Delivery / Preview / GraphQL / SDK`
3. `Visual Editing Layer`

v1 的 spec 只覆盖第一层，并明确第二层和第三层的依赖边界。

## 4. 官方协议模型

v1 采用 `System Managed Models`。

首发协议模型只有四个：

- `Article`
- `Page`
- `Reusable Section`
- `Category`

### 4.1 Article

`Article` 是结构化长内容协议，负责：

- 标题
- slug
- 正文
- SEO
- 多媒体引用
- 版本语义

### 4.2 Page

`Page` 是路由和交付协议，负责：

- 静态路由
- 动态路由
- layout slots
- section composition
- primary source declaration
- page-level SEO

### 4.3 Reusable Section

`Reusable Section` 是复用视觉内容协议，负责：

- 可复用内容块
- 页面 section 组合单元
- props contract
- props mapping
- 可视化编辑承载对象

`Header / Footer` 在 v1 中定义为特殊的 `Reusable Section` 实例，通过 `Layout Slots` 绑定。

### 4.4 Category

`Category` 是关系建模协议，负责：

- 关系引用
- 分类信息
- 动态页面的一跳关系上下文

## 5. 模型治理

### 5.1 模型治理策略

v1 只开放“扩展官方模型”，不开放完全自定义模型。

每个官方模型分为两层：

- `System Fields`
  - 平台维护
  - 参与 SDK、route、binding、delivery、SEO、version contract
- `Custom Fields`
  - 用户扩展
  - 参与编辑表单和 primary context
  - 不允许破坏系统协议字段

### 5.2 升级能力

系统官方模型允许平台做协议升级，例如：

- 给 `Article` 增加新的系统字段
- 给 `Page` 增加新的系统级交付能力

用户扩展字段不影响系统协议字段的稳定性。

## 6. Admin IA

v1 的后台主张是：

- `Content Library` 为核心工作平面
- `Models` 是治理切面
- `Site Builder` 是页面类型的沉浸式功能切面

### 6.1 Create 入口

不在左侧导航里新增独立 `Create` 菜单。

`New Content` 作为 `Content Library` 的 header action 存在，通过 overlay 展示四个官方协议类型：

- `Article`
- `Page`
- `Reusable Section`
- `Category`

### 6.2 Models

`Models` 页保留为正式入口，但采用 `Node-based Canvas` 治理体验，而不是表单列表。

它承担三项职责：

- 协议模型治理
- 扩展字段设计
- 影响分析

### 6.3 Site Builder

`Site Builder` 不作为常设主导航心智。

它是 `Page` 内容项的沉浸式全屏编辑环境，从 `Content Library` 的 `Page` 内容项情境进入。

## 7. Page / Route / Binding / Delivery

### 7.1 Page Resolve 的职责

`Page Resolve` 负责：

- 根据 path 命中一个 `Page`
- 解析静态或动态路由参数
- 载入单个 `Primary Record Context`
- 对页面中的 `Section` 执行 `Server-side Flattening`

它不承担：

- 列表查询
- 搜索
- 分页
- 聚合查询
- 排序

这些职责留给 `Query API / GraphQL`。

### 7.2 Route 模式

`Page.route` 在 v1 支持两种模式：

- `static`
  - 例：`/pricing`
- `dynamic`
  - 例：`/blog/:slug`

动态 `Page` 需要声明：

- primary source model
- 路由参数与记录字段的匹配规则

### 7.3 Route Matcher 优先级

v1 的 route matcher 采用以下规则：

1. 静态路由优先于动态路由
2. 多个动态路由冲突时，按结构特异性排序：
   - 静态 segment 更多者优先
   - segment 总数更多者优先
   - 参数段更少者优先
   - route priority 更高者优先
3. 同结构歧义模式在写入阶段直接拒绝

示例：

- `/blog/new` 优先于 `/blog/:slug`
- `/docs/:slug` 优先于 `/:section/:slug`
- `/blog/:slug` 与 `/blog/:id` 在保存时直接冲突

### 7.4 Context Injection

v1 的动态页面只支持 `single primary record context`。

Context Injection 深度固定为 `1`：

- primary record 自身字段：完整可用
- primary record 的一跳关系：自动展开为摘要对象
- 二跳及以上关系：不进入 v1 resolve 范围

支持的绑定示例：

- `primary.title`
- `primary.summary`
- `primary.category.name`

不支持的绑定示例：

- `primary.category.parent.name`
- `primary.relatedArticles[0].title`

### 7.5 Section Binding

v1 采用 `显式 Props Mapping`。

每个 section instance 拥有：

- `props_defaults`
- `props_mapping`

`props_mapping` 存储为结构化 JSON，而不是模板字符串。

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
    }
  }
}
```

v1 仅支持两种 mapping kind：

- `context_path`
- `literal`

### 7.6 Server-side Flattening

`pages.resolve(path)` 在后端执行以下顺序：

1. 归一化 path
2. 执行 route match
3. 命中 `Page`
4. 若为动态路由，加载 primary record
5. 构造 `context.primary`
6. 读取 layout 与 section instances
7. 执行 `props_defaults + props_mapping -> flattened props`
8. 返回可交付页面文档

前端消费的是 flatten 后的 JSON，而不是表达式或原始 mapping。

## 8. Lifecycle / Versioning / Publish Semantics

### 8.1 总体原则

v1 采用三个隔离原则：

1. 已发布交付永远只依赖已发布合同
2. 未发布编辑永远只影响 draft 视角
3. 模型治理和内容版本拥有独立发布边界

### 8.2 Content Version

内容项继续采用双指针模型：

- `draft_version`
- `published_version`

结构化内容、页面内容、section 内容都通过版本指针切换。

### 8.3 Page Version

`Page` 的以下内容属于 `Page Version`：

- layout
- layout slots
- section composition
- props mapping

public delivery 始终读取 published page revision 的 snapshot。

### 8.4 Model Contract Revision

模型治理也需要双指针：

- `draft_contract_revision`
- `published_contract_revision`

在 `Models` 画布中新增字段或修改扩展配置时：

- 写入 draft contract revision
- published delivery 继续读取 published contract revision

### 8.5 Publish 动作

v1 区分两类 publish：

- `Publish Content Revision`
- `Publish Model Contract Revision`

publish 之前必须经过 safety gate，校验：

- required system fields 完整性
- page bindings 完整性
- required section props 可解析性
- route 合法性
- delivery contract 不断裂

### 8.6 Perspectives

v1 至少支持：

- `public`
- `preview`

`public` 规则：

- `Page` 读取 published revision
- `Primary Record` 读取 published revision
- `Section` 读取 published revision
- `Model Contract` 读取 published contract revision

`preview` 规则：

- `Page` 优先 draft，缺失时回退 published
- `Primary Record` 优先 draft，缺失时回退 published
- `Section` 优先 draft，缺失时回退 published
- `Model Contract` 优先 draft contract，缺失时回退 published contract

### 8.7 已发布页面引用 Draft 依赖

#### public

若 `Page` 已发布，但引用对象没有 published revision：

- publish gate 优先阻止这种状态进入已发布世界
- 若历史脏数据进入 resolve，则返回：
  - HTTP `409`
  - `PAGE_DEPENDENCY_UNAVAILABLE`

#### preview

preview 规则：

- 优先读取 draft revision
- draft 不存在时回退 published revision
- 两者都不存在时记录 diagnostics warning
- 若依赖为 required 且缺失会阻断页面结构，则返回：
  - HTTP `500`
  - `PAGE_PREVIEW_DEPENDENCY_UNAVAILABLE`

## 9. Error Contracts

`pages.resolve(path)` 需要区分以下错误：

- `PAGE_ROUTE_NOT_FOUND`
  - 没有任何页面匹配 path
- `PAGE_PRIMARY_RECORD_NOT_FOUND`
  - 动态页面命中，但 primary record 不存在
- `PAGE_PRIMARY_RECORD_UNAVAILABLE`
  - public 视角下 primary record 不可交付
- `PAGE_PRIMARY_RECORD_PREVIEW_UNAVAILABLE`
  - preview 视角下 primary record 不可读取
- `PAGE_BINDING_RESOLUTION_FAILED`
  - page 与 primary record 存在，但 props mapping 无法解析
- `PAGE_DEPENDENCY_UNAVAILABLE`
  - public 页面依赖没有可发布版本
- `PAGE_PREVIEW_DEPENDENCY_UNAVAILABLE`
  - preview 页面依赖缺失且阻断结构

## 10. Site Settings

`Site Settings` 在 v1 只承担系统级职责，不承担内容正文职责。

保留的系统职责：

- site identity
- domains and host resolution
- localization
- SEO defaults
- preview tokens
- publish visibility policy
- sitemap / crawl policy
- site-wide slot binding policy

不再保留的职责：

- Header 正文本身
- Footer 正文本身
- 页面级 section 内容
- 内容型 global block 文案

这些对象全部回到 `Reusable Section` 和 `Page` 体系中治理。

## 11. API 与 SDK 的依赖边界

v1 的核心合同会成为后续能力的依赖根：

- `Delivery API`
  - 消费 published contract 与 page resolve
- `Preview API`
  - 消费 preview perspective
- `GraphQL`
  - 作为查询层投影建立在稳定内容合同之上
- `SDK`
  - 围绕官方协议模型与 delivery contract 提供强类型接口

## 12. Backend 施工信号

Backend v1 可以按以下模块推进：

1. 官方协议模型注册表
2. 模型 draft/published contract revision
3. route pattern 持久化与冲突校验
4. route matcher
5. primary source resolver
6. context assembler
7. section binding resolver
8. flattened page document schema
9. publish safety gate
10. perspective-aware resolve
11. dependency availability validation
12. site settings 与 global section binding 的职责拆分

## 13. 测试与验证

v1 的合同需要至少覆盖这些测试面：

- route matcher 优先级与冲突校验
- primary source 单记录解析
- context injection depth=1
- props_mapping 结构化取值
- page flattening 输出稳定性
- public / preview perspective 隔离
- publish gate 对无效绑定与无效依赖的阻断
- 已发布 delivery 不受 draft model contract 影响

## 14. 后续阶段

在这份 spec 完成后，后续阶段按顺序推进：

1. Headless CMS Core implementation plan
2. Delivery / Preview / SDK implementation plan
3. GraphQL design
4. Visual Editing Layer design
