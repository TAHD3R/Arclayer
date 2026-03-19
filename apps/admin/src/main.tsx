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
import { getSetupStatus, getSystemRuntime } from "@/api/system";
import { useSetupWizardStore } from "@/stores/use-setup-wizard-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { queryClient } from "@/lib/query/query-client-instance";

async function bootstrap() {
  initializePreferences();
  await useAuthStore.persist.rehydrate();
  await useWorkspaceStore.persist.rehydrate();

  const { locale } = usePreferencesStore.getState();
  await initI18n(locale);

  // Runtime mode + setup status are needed by the global route guard.
  // Fetch both before rendering so `__root.beforeLoad` can synchronously evaluate redirects.
  const [setupStatusResult, runtimeResult] = await Promise.allSettled([
    getSetupStatus(),
    getSystemRuntime(),
  ]);

  if (setupStatusResult.status === "fulfilled") {
    const status = setupStatusResult.value;
    useSetupWizardStore.getState().setSystemStatus(status);

    const deploymentMode =
      runtimeResult.status === "fulfilled" ? runtimeResult.value.deploymentMode : null;
    // Only self-host requires first-run setup gating. Avoid clearing SaaS sessions.
    if (status.initialized === false && deploymentMode !== "saas") {
      useAuthStore.getState().clear();
      useWorkspaceStore.getState().clearWorkspace();
    }
  } else {
    // Degrade gracefully: when API is unreachable, keep status unknown and let auth guard handle routing.
    useSetupWizardStore.getState().setSystemStatus(null);
  }

  if (runtimeResult.status === "fulfilled") {
    useSetupWizardStore.getState().setDeploymentMode(runtimeResult.value.deploymentMode);
  } else {
    useSetupWizardStore.getState().setDeploymentMode(null);
  }

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
