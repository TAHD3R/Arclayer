import React from "react";
import { DesignDocumentRenderer } from "@celestial/site-renderer-core";

import type { DesignDocumentV1, ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";

export type PortalDocumentPageProps = {
  document: DesignDocumentV1;
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

  // SSR 首屏策略：固定 baseWidth/baseHeight，避免 SSR/CSR 首次渲染不一致导致水合 warning。
  // CSR 水合后再根据 window 实际尺寸触发二次布局校正。
  const [viewport, setViewport] = React.useState(() => ({
    width: 1440,
    height: 800,
    baseWidth: 1440,
    baseHeight: 800,
  }));

  React.useEffect(() => {
    const update = () => {
      setViewport((prev) => ({
        ...prev,
        width: window.innerWidth,
        height: window.innerHeight,
      }));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <>
      <DesignDocumentRenderer document={document} ctx={viewerCtx} viewport={viewport} />
    </>
  );
}
