import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./index.css";
import App from "./app";

import { initI18n } from "@/lib/i18n";
import { setUnauthorizedHandler } from "@/lib/http/client";
import { redirectToAdminLogin } from "@/lib/routing/redirect-to-admin-login";
import { useAuthStore } from "@/stores/use-auth-store";
import { initializePreferences, usePreferencesStore } from "@/stores/use-preferences-store";

function redirectLocalDevToStudioOrigin(): void {
  if (typeof window === "undefined") return;
  const { hostname } = window.location;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return;

  // Studio 需要在 `studio.<base_domain>` 下运行，才能与 Admin 通过共享 Cookie Domain 互通登录态。
  // 当开发者直接打开 Vite 的 localhost 端口时，我们强制跳转到 Studio 子域名。
  const target = `http://studio.celestial.localhost${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
}

function ensureTrailingSlashOnBasePath(): void {
  if (typeof window === "undefined") return;

  const baseUrl = import.meta.env.BASE_URL;
  const basepath = baseUrl === "/" ? "/" : baseUrl.replace(/\/$/, "");

  if (basepath === "/") return;

  if (window.location.pathname === basepath) {
    window.location.replace(`${basepath}/${window.location.search}`);
  }
}

async function bootstrap() {
  // 统一从 Studio 子域名入口进入，避免跨子域登录态无法共享。
  redirectLocalDevToStudioOrigin();

  // 兼容 basepath 无尾斜杠的访问（例如 `/x` vs `/x/`），避免 Router 以空路径解析导致 NotFound。
  // 真实环境下最好由网关统一做 canonical redirect，但本地开发需要应用自修复。
  ensureTrailingSlashOnBasePath();

  initializePreferences();
  await useAuthStore.persist.rehydrate();

  const { locale } = usePreferencesStore.getState();
  await initI18n(locale);

  setUnauthorizedHandler(() => {
    useAuthStore.getState().clear();
    redirectToAdminLogin();
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  requestAnimationFrame(() => {
    (window as unknown as { __hideAppLoading?: () => void }).__hideAppLoading?.();
  });
}

void bootstrap();
