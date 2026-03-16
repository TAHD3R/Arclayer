# @arclayer/api-client

基于 FastAPI 的 OpenAPI 文档自动生成的 TypeScript SDK（含类型与请求方法）。

## 生成

在仓库根目录执行：

```bash
pnpm --filter @arclayer/api-client generate
```

该命令会：

1. 从 `apps/api` 离线导出 OpenAPI JSON 到 `packages/api-client/openapi.json`
2. 使用 `@hey-api/openapi-ts` 生成 SDK 到 `packages/api-client/src/generated`

## 使用（前端）

在前端工程中添加依赖：

```bash
pnpm --filter @arclayer/admin add @arclayer/api-client@workspace:*
```

初始化客户端配置（示例，具体以生成的 client 导出为准）：

```ts
import { client } from "@arclayer/api-client";

client.setConfig({
  baseUrl: "http://127.0.0.1:8000",
});
```

然后直接调用生成的 API 方法（示例）：

```ts
import { servicesAuthServiceMe } from "@arclayer/api-client";

await servicesAuthServiceMe({});
```
