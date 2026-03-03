import React from "react";

import type { PageBlueprint, ViewerContext } from "@celestial/block-protocol";
import type { PortalRouteMatch } from "@celestial/internal-types";
import type { ContentRefIncludesMap, DesignRenderDataSourcesV1 } from "@celestial/renderer";

import { PortalDocumentPage } from "@/views/portal-document-page";

export { Page };

type PortalPageProps = {
  mode: "public";
  document: PageBlueprint;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  pathname: string;
  showHydration: boolean;
  dataSources?: DesignRenderDataSourcesV1;
  includes?: ContentRefIncludesMap;
};

function Page(props: PortalPageProps) {
  return (
    <PortalDocumentPage
      document={props.document}
      match={props.match}
      viewerCtx={props.viewerCtx}
      showHydration={props.showHydration}
      {...(props.dataSources ? { dataSources: props.dataSources } : {})}
      {...(props.includes ? { includes: props.includes } : {})}
    />
  );
}
