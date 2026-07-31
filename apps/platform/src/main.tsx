import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/app";
import { configurePlatformBoneyard } from "@/lib/boneyard";
import { initializePlatformI18n, resolveInitialLocale } from "@/lib/i18n";
import "@/index.css";

async function bootstrap(): Promise<void> {
  configurePlatformBoneyard();
  await initializePlatformI18n(resolveInitialLocale());
  const root = document.getElementById("root");
  if (!root) throw new Error("Platform application root element is missing");
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  requestAnimationFrame(() => window.__hideAppLoading?.());
}

void bootstrap();
