import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { HttpError } from "@/router/routerFallbacks";
import { resolveHardcodedPublicRoute } from "@/runtime/hardcoded-site";

export const Route = createFileRoute("/$")({
  loader: ({ params }) => {
    // TanStack Router stores the wildcard segments under params._splat.
    const pathname = "/" + (params._splat ?? "");

    const resolved = resolveHardcodedPublicRoute(pathname);
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
