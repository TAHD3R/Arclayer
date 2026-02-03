import React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { resolvePortalRoute } from "@/runtime/portal-route-resolver";
import { HttpError } from "@/router/routerFallbacks";
import { getTokenFromLocationSearch, toExternalPreviewHref } from "@/router/namespaces";

export const Route = createFileRoute("/preview/")({
  loader: async ({ context, location }) => {
    const token = getTokenFromLocationSearch(location.search);
    const resolved = await resolvePortalRoute(
      "/",
      token
        ? { siteId: context.siteCtx.siteId, mode: "preview", token }
        : { siteId: context.siteCtx.siteId, mode: "preview" },
    );

    if (resolved.kind === "redirect") {
      throw redirect({
        href: toExternalPreviewHref(resolved.to, token),
        statusCode: resolved.status,
      });
    }
    if (resolved.kind === "not_found") {
      throw new HttpError(404, "Preview page not found.");
    }

    return { document: resolved.document, match: resolved.match };
  },
  component: PreviewIndexPage,
});

function PreviewIndexPage() {
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
