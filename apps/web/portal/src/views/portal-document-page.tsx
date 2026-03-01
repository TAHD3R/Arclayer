import React from "react";
import { PageBlueprintRenderer } from "@celestial/site-renderer-core";

import type { PageBlueprint, ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/portal-types";
import type {
  ContentRefIncludesMap,
  DesignRenderDataSourcesV1,
} from "@celestial/site-renderer-core";

export type PortalDocumentPageProps = {
  document: PageBlueprint;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  showHydration?: boolean;
  dataSources?: DesignRenderDataSourcesV1;
  includes?: ContentRefIncludesMap;
};

export function PortalDocumentPage({
  document,
  match,
  viewerCtx: baseViewerCtx,
  dataSources: baseDataSources,
  includes,
}: PortalDocumentPageProps) {
  const viewerCtx = React.useMemo(
    () => ({
      ...baseViewerCtx,
      routeParams: match.params,
      variantId: match.variantId,
    }),
    [baseViewerCtx, match.params, match.variantId],
  );

  const dataSources: DesignRenderDataSourcesV1 = React.useMemo(() => {
    const viewer = {
      ...baseDataSources?.viewer,
      locale: viewerCtx.locale,
      ...(viewerCtx.fallbackLocale ? { fallbackLocale: viewerCtx.fallbackLocale } : {}),
      ...(viewerCtx.breakpoint ? { breakpoint: viewerCtx.breakpoint } : {}),
      ...(viewerCtx.mode ? { mode: viewerCtx.mode } : {}),
    };

    if (!baseDataSources) {
      return { routeParams: match.params, viewer };
    }
    return { ...baseDataSources, routeParams: match.params, viewer };
  }, [
    baseDataSources,
    match.params,
    viewerCtx.locale,
    viewerCtx.fallbackLocale,
    viewerCtx.breakpoint,
    viewerCtx.mode,
  ]);

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
      <PageBlueprintRenderer
        document={document}
        ctx={viewerCtx}
        viewport={viewport}
        dataSources={dataSources}
        {...(includes ? { includes } : {})}
      />
    </>
  );
}
