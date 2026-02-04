import React from "react";

import type { ViewerContext } from "@celestial/site-block-protocol";

import { EditorHostPage } from "@/features/editor-host/editor-host-page";
import { ensurePortalRequestContext } from "@/runtime/request-context";

export { Page, onBeforeRender };

type EditorHostPageProps = {
  mode: "editor-host";
  viewerCtx: ViewerContext;
};

async function onBeforeRender(pageContext: { urlOriginal: string }) {
  const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext);
  return {
    pageContext: {
      pageProps: {
        mode: "editor-host",
        viewerCtx,
      } satisfies EditorHostPageProps,
      siteCtx,
      viewerCtx,
    },
  };
}

function Page(_props: EditorHostPageProps) {
  return <EditorHostPage />;
}
