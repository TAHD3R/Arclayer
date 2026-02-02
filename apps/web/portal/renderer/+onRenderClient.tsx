import React from "react";
import { hydrateRoot } from "react-dom/client";

import { PageShell } from "./PageShell";
import { createPortalRouter } from "@/router";
import { DEFAULT_FALLBACK_LOCALE, detectBrowserLocale } from "@celestial/web-core/i18n";

export { onRenderClient };

async function onRenderClient(pageContext: {
  urlOriginal: string;
  viewerCtx?: { locale: "zh-CN" | "en-US"; fallbackLocale?: "zh-CN" | "en-US" };
}) {
  const viewerCtx = pageContext.viewerCtx ?? {
    locale: detectBrowserLocale(),
    fallbackLocale: DEFAULT_FALLBACK_LOCALE,
  };

  const router = createPortalRouter({
    kind: "client",
    url: pageContext.urlOriginal,
    viewerCtx,
  });

  // Ensure router state is ready before hydrating (even if we currently have no loaders).
  await router.load();

  hydrateRoot(document.getElementById("page-view")!, <PageShell router={router} />);
}
