import React from "react";
import { PageBlueprintRenderer } from "@celestial/renderer";

import type { PageBlueprint, ViewerContext } from "@celestial/block-protocol";
import type { PortalRouteMatch, PortalRuntimeConfig } from "@celestial/internal-types";
import type { ContentRefIncludesMap, DesignRenderDataSourcesV1 } from "@celestial/renderer";

import { buildRuntimeSiteData } from "@/runtime/runtime-site-data";

export type PortalDocumentPageProps = {
  document: PageBlueprint;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  showHydration?: boolean;
  dataSources?: DesignRenderDataSourcesV1;
  includes?: ContentRefIncludesMap;
  runtimeConfig?: PortalRuntimeConfig;
};

export function PortalDocumentPage({
  document,
  match,
  viewerCtx: baseViewerCtx,
  dataSources: baseDataSources,
  includes,
  runtimeConfig,
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
    const runtimeSiteData = buildRuntimeSiteData(runtimeConfig);
    const viewer = {
      ...baseDataSources?.viewer,
      locale: viewerCtx.locale,
      ...(viewerCtx.fallbackLocale ? { fallbackLocale: viewerCtx.fallbackLocale } : {}),
      ...(viewerCtx.breakpoint ? { breakpoint: viewerCtx.breakpoint } : {}),
      ...(viewerCtx.mode ? { mode: viewerCtx.mode } : {}),
    };
    const site =
      runtimeSiteData || baseDataSources?.site
        ? { ...runtimeSiteData, ...baseDataSources?.site }
        : undefined;

    if (!baseDataSources) {
      return Object.assign({}, { routeParams: match.params, viewer }, site ? { site } : {});
    }
    return Object.assign(
      {},
      baseDataSources,
      { routeParams: match.params, viewer },
      site ? { site } : {},
    );
  }, [
    baseDataSources,
    match.params,
    runtimeConfig,
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
