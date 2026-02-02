import React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { resolvePortalRoute } from "@/runtime/portal-route-resolver";
import { HttpError } from "@/router/routerFallbacks";
import { getTokenFromLocationSearch, toExternalPreviewHref } from "@/router/namespaces";

export const Route = createFileRoute("/preview/$")({
  loader: async ({ params, context, location }) => {
    // Wildcard segments are stored under params._splat.
    const pathname = "/" + (params._splat ?? "");
    const token = getTokenFromLocationSearch(location.search);
    const resolved = await resolvePortalRoute(
      pathname,
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
      throw new HttpError(404, `Preview page not found: ${pathname}`);
    }

    return { document: resolved.document };
  },
  component: PreviewCatchAllPage,
});

function PreviewCatchAllPage() {
  const { document } = Route.useLoaderData();
  const { viewerCtx } = Route.useRouteContext();
  return <DocumentRenderer document={document} ctx={viewerCtx} />;
}
