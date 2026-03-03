import React from "react";

import type { ViewerContext } from "@celestial/block-protocol";
import type { PortalRouteMatch } from "@celestial/internal-types";

import { EditorSiteView } from "@/views/editor/editor-site-view";

export { Page };

type EditorPageProps = {
  mode: "editor";
  document: unknown;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  pathname: string;
  siteId: string;
  token?: string;
};

function Page(props: EditorPageProps) {
  return (
    <EditorSiteView
      initialDocument={props.document}
      viewerCtx={props.viewerCtx}
      pathname={props.pathname}
      siteId={props.siteId}
    />
  );
}
