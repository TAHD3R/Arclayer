import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "flag-icons/css/flag-icons.min.css";
import "./index.css";
import App from "./app";

import { initI18n } from "@/lib/i18n";
import { router } from "@/routes/-router";
import { setUnauthorizedHandler } from "@/lib/http/client";
import { isPublicPath } from "@/lib/routing/route-identity";
import { useAuthStore } from "@/stores/use-auth-store";
import { initializePreferences, usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { queryClient } from "@/lib/query/query-client-instance";

async function bootstrap() {
  initializePreferences();
  await useAuthStore.persist.rehydrate();
  await useWorkspaceStore.persist.rehydrate();

  const { locale } = usePreferencesStore.getState();
  await initI18n(locale);

  setUnauthorizedHandler(() => {
    // During explicit logout, stale in-flight requests can still resolve on `/login`.
    // Once we are already on a public auth page, ignore those late 401s instead of
    // re-clearing state and retriggering route side effects.
    if (isPublicPath(window.location.pathname)) {
      return;
    }

    void queryClient.cancelQueries();
    queryClient.clear();
    useAuthStore.getState().clear();
    useWorkspaceStore.getState().clearWorkspace();
    const current = `${window.location.pathname}${window.location.search}`;
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
