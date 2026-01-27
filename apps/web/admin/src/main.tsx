import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./assets/index.css";
import App from "./App";

import { initI18n } from "@/utils/i18n";
import { router } from "@/routes/-router";
import { setUnauthorizedHandler } from "@/lib/http/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { initializePreferences, usePreferencesStore } from "@/stores/usePreferenceStore";

async function bootstrap() {
  initializePreferences();
  await useAuthStore.persist.rehydrate();

  const { locale } = usePreferencesStore.getState();
  await initI18n(locale);

  setUnauthorizedHandler(() => {
    useAuthStore.getState().clear();
    // Avoid redirect loops on public auth pages.
    const current = `${window.location.pathname}${window.location.search}`;
    if (window.location.pathname === "/login" || window.location.pathname === "/reset-password") {
      return;
    }
    void router.navigate({
      to: "/login",
      search: { redirect: current },
    });
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  requestAnimationFrame(() => {
    window.__hideAppLoading?.();
  });
}

void bootstrap();
