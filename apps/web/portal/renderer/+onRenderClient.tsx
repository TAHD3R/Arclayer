import React from "react";
import { hydrateRoot } from "react-dom/client";

import { PageShell } from "./PageShell";

export { onRenderClient };

async function onRenderClient(pageContext: {
  Page: React.ComponentType<any>;
  pageProps?: Record<string, unknown>;
}) {
  hydrateRoot(document.getElementById("page-view")!, <PageShell pageContext={pageContext} />);
}
