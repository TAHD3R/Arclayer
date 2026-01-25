import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./index.css";
import App from "./App";
import { ProgressProvider } from "@bprogress/react";

import { initI18n } from "@/app/i18n";
import { router } from "@/app/router";
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
    void router.navigate({
      to: "/login",
      search: { redirect: `${window.location.pathname}${window.location.search}` },
    });
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ProgressProvider color="var(--primary)" height="2px" spinnerPosition="top-right">
        <App />
      </ProgressProvider>
    </StrictMode>,
  );
}

void bootstrap();
