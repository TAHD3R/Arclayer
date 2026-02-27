import React from "react";

import type { DesignDocumentV1, ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";
import type { DesignRenderDataSourcesV1 } from "@celestial/site-renderer-core";

import { PortalDocumentPage } from "@/views/portal-document-page";

export { Page };

type PortalPageProps = {
  mode: "public";
  document: DesignDocumentV1;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  pathname: string;
  showHydration: boolean;
  dataSources?: DesignRenderDataSourcesV1;
};

function Page(props: PortalPageProps) {
  return (
    <PortalDocumentPage
      document={props.document}
      match={props.match}
      viewerCtx={props.viewerCtx}
      showHydration={props.showHydration}
      {...(props.dataSources ? { dataSources: props.dataSources } : {})}
    />
  );
}
