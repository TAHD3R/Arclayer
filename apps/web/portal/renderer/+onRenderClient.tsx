import React from "react";
import { hydrateRoot } from "react-dom/client";

import { PageShell } from "./PageShell";
import { createPortalRouter } from "@/router";

export { onRenderClient };

async function onRenderClient(pageContext: { urlOriginal: string }) {
  const router = createPortalRouter({
    kind: "client",
    url: pageContext.urlOriginal,
  });

  // Ensure router state is ready before hydrating (even if we currently have no loaders).
  await router.load();

  hydrateRoot(document.getElementById("page-view")!, <PageShell router={router} />);
}
