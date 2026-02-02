import React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { HttpError } from "@/router/routerFallbacks";
import { resolvePortalRoute } from "@/runtime/hardcoded-site";
import { ApiError } from "@celestial/web-core/http";

export const Route = createFileRoute("/$")({
  loader: async ({ params, context }) => {
    // TanStack Router stores the wildcard segments under params._splat.
    const pathname = "/" + (params._splat ?? "");

    let resolved;
    try {
      resolved = await resolvePortalRoute(pathname, {
        siteId: context.siteCtx.siteId,
        mode: "public",
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof ApiError) throw new HttpError(err.status, err.message);
      throw new HttpError(503, err instanceof Error ? err.message : "Backend unavailable");
    }
    if (resolved.kind === "redirect") {
      // Use `href` so TanStack Router sets the Location header (needed for SSR -> real HTTP redirect).
      throw redirect({ href: resolved.to, statusCode: resolved.status });
    }
    if (resolved.kind === "not_found") {
      throw new HttpError(404, `Page not found: ${pathname}`);
    }
    return { document: resolved.document };
  },
  component: CatchAllPage,
});

function CatchAllPage() {
  const { document } = Route.useLoaderData();
  const { viewerCtx } = Route.useRouteContext();
  return <DocumentRenderer document={document} ctx={viewerCtx} />;
}
