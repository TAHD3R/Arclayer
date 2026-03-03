# Portal（apps/web/portal）

## 范围

- 以 Vike（vite-plugin-ssr）作为唯一路由主控，使用 Filesystem Routing（`+Page` / `+route`）。
- API 驱动的 `PageBlueprint` 在服务端渲染并在客户端水合。
- SSR `<head>` 注入运行时主题 CSS 变量与字体。

## 路由约定

- 公共站点（Self-host/Dev）：`/w/:workspaceSlug/*`（路径多租户；`/` 在无 host 映射时返回 404）。
- 公共站点（SaaS）：`https://{workspaceSlug}.{base_domain}/*`（host 派生 workspaceSlug；仍可兼容 `/w/:workspaceSlug/*`）。
- 预览模式：`/preview/site/:siteId/*?token=...`
- 编辑器 iframe：`/editor/site/:siteId/*?token=...`
- 编辑器 host：`/editor-host`
- Debug：`/debug/403`、`/debug/500`

## 共享桥接

- Portal 与 Admin 共享的编辑器 URL 与通信协议位于 `packages/bridges/editor`。
- Admin 调试入口（iframe 容器）为 `/debug/portal-editor`。

## API 路由解析（本地）

- Portal 通过 `/api/*` 代理到 FastAPI。
  - 推荐配置位于 `apps/web/portal/.env.local`（从 `.env.local.example` 复制）。
  - 开发脚本会在存在时自动通过 Node `--env-file` 加载（Node >= 20），避免缺少 env 文件导致 dev 启动失败。
  - 浏览器保持同源请求，SSR 保持确定性。
  - `VITE_API_PROXY_TARGET` 与 Admin 保持一致。

## 本地命令

- `pnpm -C apps/web/portal dev`
- `pnpm -C apps/web/portal start:local`

## 预览 Token（stub）

- `POST /api/v1/sites/{siteId}/preview-tokens`
- 示例：
  - `curl -s -X POST http://127.0.0.1:8000/api/v1/sites/00000000-0000-0000-0000-000000000001/preview-tokens`
