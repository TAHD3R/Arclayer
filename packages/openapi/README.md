# @arclayer/openapi

基于 FastAPI 的 OpenAPI 文档自动生成的 TypeScript SDK（含类型与请求方法）。

`packages/openapi` 是仓库内唯一的后端 API 边界请求/响应类型来源。后端 API
类型从 `apps/api` 的 FastAPI/Pydantic schema 导出并生成；不要在 Admin、SDK
或其它客户端里手写、复制或通过 facade 包转发后端请求/响应 shape。

## 生成

在仓库根目录执行：

```bash
pnpm --filter @arclayer/openapi generate
```

该命令会：

1. 从 `apps/api` 离线导出 OpenAPI JSON 到 `packages/openapi/openapi.json`
2. 使用 `@hey-api/openapi-ts` 生成 SDK 到 `packages/openapi/src/generated`

API contract 变更必须先修改 `apps/api` 的 schema / route source，再运行上述脚本。
不要手动编辑 `packages/openapi/src/generated/**`。

## 类型所有权

- 后端请求/响应边界类型：直接从 `@arclayer/openapi` 或 Admin helper
  `@arclayer/openapi/admin-types` 导入。
- SDK transport options、metadata、envelope、result、pagination wrapper 等运行时类型：
  留在 owning SDK package，例如 `packages/management-sdk/src/types.ts`。
- Admin UI-only view model、row、form state、UI state：留在 owning Admin feature 或
  `apps/admin/src/types/**`，命名应表达 UI ownership。

Forbidden:

- `packages/contracts`
- `@arclayer/contracts`
- Admin local alias modules that forward generated backend boundary types
- Admin API type barrel re-export generated backend boundary types
- SDK public aliases that preserve old contracts package naming

## 使用（前端）

在前端工程中添加依赖：

```bash
pnpm --filter @arclayer/admin add @arclayer/openapi@workspace:*
```

初始化客户端配置（示例，具体以生成的 client 导出为准）：

```ts
import { client } from "@arclayer/openapi";

client.setConfig({
  baseUrl: "http://127.0.0.1:8000",
});
```

然后直接调用生成的 API 方法（示例）：

```ts
import { servicesAuthServiceMe } from "@arclayer/openapi";

await servicesAuthServiceMe({});
```
