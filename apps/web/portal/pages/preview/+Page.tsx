import React from "react";

import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";

import { PortalDocumentPage } from "@/views/portal-document-page";

export { Page };

type PreviewPageProps = {
  mode: "preview";
  document: CoreDocumentIR;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  pathname: string;
  token?: string;
};

function Page(props: PreviewPageProps) {
  return (
    <PortalDocumentPage document={props.document} match={props.match} viewerCtx={props.viewerCtx} />
  );
}
