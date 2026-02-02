import React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { resolvePortalRoute } from "@/runtime/portal-route-resolver";
import { HydrationStatus } from "@/components/HydrationStatus";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const resolved = await resolvePortalRoute("/", {
      siteId: context.siteCtx.siteId,
      mode: "public",
    });
    if (resolved.kind === "redirect") {
      // Use `href` so TanStack Router sets the Location header (needed for SSR -> real HTTP redirect).
      throw redirect({ href: resolved.to, statusCode: resolved.status });
    }
    if (resolved.kind !== "page") throw new Error("Invariant: home route must resolve to a page");
    return { document: resolved.document };
  },
  component: IndexPage,
});

function IndexPage() {
  const { document } = Route.useLoaderData();
  const { viewerCtx } = Route.useRouteContext();

  return (
    <>
      <HydrationStatus />
      <DocumentRenderer document={document} ctx={viewerCtx} />
    </>
  );
}
