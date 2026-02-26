import React from "react";
import { DocumentRenderer } from "@celestial/site-renderer-core";
import type { DocumentIR } from "@celestial/site-renderer-core";

import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";

export type PortalDocumentPageProps = {
  document: DocumentIR;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  showHydration?: boolean;
};

export function PortalDocumentPage({
  document,
  match,
  viewerCtx: baseViewerCtx,
}: PortalDocumentPageProps) {
  const viewerCtx = React.useMemo(
    () => ({
      ...baseViewerCtx,
      routeParams: match.params,
      variantId: match.variantId,
    }),
    [baseViewerCtx, match.params, match.variantId],
  );

  return (
    <>
      <DocumentRenderer document={document} ctx={viewerCtx} />
    </>
  );
}
