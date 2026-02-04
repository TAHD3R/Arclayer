import React from "react";
import { DocumentRenderer } from "@celestial/site-renderer-core";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";

import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";
import { HydrationStatus } from "@/components/HydrationStatus";

export type PortalDocumentPageProps = {
  document: CoreDocumentIR;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  showHydration?: boolean;
};

export function PortalDocumentPage({
  document,
  match,
  viewerCtx: baseViewerCtx,
  showHydration = false,
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
      {showHydration ? <HydrationStatus /> : null}
      <DocumentRenderer document={document} ctx={viewerCtx} />
    </>
  );
}
