import React from "react";
import { hydrateRoot } from "react-dom/client";

import { PageShell } from "./PageShell";

export { onRenderClient };

type PortalPageContext = {
  Page: React.ComponentType<Record<string, unknown>>;
  pageProps?: Record<string, unknown>;
};

async function onRenderClient(pageContext: PortalPageContext) {
  hydrateRoot(document.getElementById("page-view")!, <PageShell pageContext={pageContext} />);
}
