import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./index.css";
import App from "./App";
import { ProgressProvider } from "@bprogress/react";

import { initI18n } from "@/core/i18n";
import { router } from "@/core/router";
import { setUnauthorizedHandler } from "@/lib/http/client";
import { useAuthStore } from "@/stores/auth.store";
import { initializePreferences, usePreferencesStore } from "@/stores/preferences.store";

async function bootstrap() {
  initializePreferences();
  useAuthStore.persist.rehydrate();

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
      <ProgressProvider color="var(--primary)" height="2px" spinnerPosition="top-right">
        <App />
      </ProgressProvider>
    </StrictMode>,
  );

  requestAnimationFrame(() => {
    window.__hideAppLoading?.();
  });
}

void bootstrap();
