import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./assets/index.css";
import App from "./app";

import { initI18n } from "@/lib/i18n";
import { router } from "@/routes/-router";
import { setUnauthorizedHandler } from "@/lib/http/client";
import { useAuthStore } from "@/stores/use-auth-store";
import { initializePreferences, usePreferencesStore } from "@/stores/use-preference-store";
import { getSetupStatus } from "@/api/system";
import { useSetupWizardStore } from "@/stores/use-setup-wizard-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

async function bootstrap() {
  initializePreferences();
  await useAuthStore.persist.rehydrate();
  await useWorkspaceStore.persist.rehydrate();

  const { locale } = usePreferencesStore.getState();
  await initI18n(locale);

  // Setup status is needed for the global route guard. Fetch it before rendering so
  // `__root.beforeLoad` can synchronously read the result and avoid redirect flicker.
  try {
    const status = await getSetupStatus();
    useSetupWizardStore.getState().setSystemStatus(status);
    // When system is not initialized (fresh DB), any persisted auth tokens are guaranteed to be stale.
    // Clearing them avoids confusing redirects and noisy 401s.
    if (status.initialized === false) {
      useAuthStore.getState().clear();
      useWorkspaceStore.getState().clearWorkspace();
    }
  } catch {
    // Degrade gracefully: when API is unreachable, keep status unknown and let auth guard handle routing.
    useSetupWizardStore.getState().setSystemStatus(null);
  }

  setUnauthorizedHandler(() => {
    useAuthStore.getState().clear();
    useWorkspaceStore.getState().clearWorkspace();
    // Avoid redirect loops on public auth pages.
    const current = `${window.location.pathname}${window.location.search}`;
    if (
      window.location.pathname === "/login" ||
      window.location.pathname === "/reset-password" ||
      window.location.pathname.startsWith("/setup") ||
      window.location.pathname === "/accept-invite"
    ) {
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
