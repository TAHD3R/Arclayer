# Studio (WIP)

独立前端应用（可视化编辑器），推荐使用 SaaS dev 模式通过子域名访问。

当前目标：Viewport-first 画布（无内部缩放/平移）+ 单人编辑 + Preview 模式滚动动画一致性（含 ScrollTrigger）。

开发访问建议：

- 推荐 SaaS dev：先执行 `pnpm dev:saas`，再执行 `pnpm studio`。
- 通过 `http://studio.celestial.localhost/` 访问（与 Admin 共享登录态，需启用 cookie session）。
