import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./index.css";
import App from "./App";

import { initI18n } from "@/app/i18n";
import { initializePreferences, usePreferencesStore } from "@/stores/preferences.store";

async function bootstrap() {
  initializePreferences();
  const { locale } = usePreferencesStore.getState();
  await initI18n(locale);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
