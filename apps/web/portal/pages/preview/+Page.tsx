import React from "react";

import type { DesignDocumentV1, ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";
import type {
  ContentRefIncludesMap,
  DesignRenderDataSourcesV1,
} from "@celestial/site-renderer-core";

import { PortalDocumentPage } from "@/views/portal-document-page";

export { Page };

type PreviewPageProps = {
  mode: "preview";
  document: DesignDocumentV1;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  pathname: string;
  token?: string;
  dataSources?: DesignRenderDataSourcesV1;
  includes?: ContentRefIncludesMap;
};

function Page(props: PreviewPageProps) {
  return (
    <PortalDocumentPage
      document={props.document}
      match={props.match}
      viewerCtx={props.viewerCtx}
      {...(props.dataSources ? { dataSources: props.dataSources } : {})}
      {...(props.includes ? { includes: props.includes } : {})}
    />
  );
}
