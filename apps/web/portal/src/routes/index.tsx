import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { resolveHardcodedPublicRoute } from "@/runtime/hardcoded-site";
import { HydrationStatus } from "@/components/HydrationStatus";

export const Route = createFileRoute("/")({
  loader: () => {
    // Sprint 1/2: hardcoded route resolver. Later replaced by backend route resolver.
    const resolved = resolveHardcodedPublicRoute("/");
    if (resolved.kind !== "page") {
      // "/" is always expected to exist for the portal.
      throw new Error("Invariant: home route must resolve to a page");
    }
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
