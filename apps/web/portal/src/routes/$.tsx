import React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { HttpError } from "@/router/routerFallbacks";
import { resolvePortalRoute } from "@/runtime/portal-route-resolver";

export const Route = createFileRoute("/$")({
  loader: async ({ params, context }) => {
    // TanStack Router stores the wildcard segments under params._splat.
    const pathname = "/" + (params._splat ?? "");

    const resolved = await resolvePortalRoute(pathname, {
      siteId: context.siteCtx.siteId,
      mode: "public",
    });
    if (resolved.kind === "redirect") {
      // Use `href` so TanStack Router sets the Location header (needed for SSR -> real HTTP redirect).
      throw redirect({ href: resolved.to, statusCode: resolved.status });
    }
    if (resolved.kind === "not_found") {
      throw new HttpError(404, `Page not found: ${pathname}`);
    }
    return { document: resolved.document, match: resolved.match };
  },
  component: CatchAllPage,
});

function CatchAllPage() {
  const { document, match } = Route.useLoaderData();
  const { viewerCtx: baseViewerCtx } = Route.useRouteContext();

  const viewerCtx = React.useMemo(
    () => ({
      ...baseViewerCtx,
      routeParams: match.params,
      variantId: match.variantId,
    }),
    [baseViewerCtx, match.params, match.variantId],
  );

  return <DocumentRenderer document={document} ctx={viewerCtx} />;
}
