import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { resolveEditorDocument } from "../-resolveEditorDocument";
import { EditorSiteView } from "./-EditorSiteView";

export const Route = createFileRoute("/editor/site/$siteId/")({
  loader: async ({ context, location }) => {
    // Default to the site root path when no splat is provided.
    return await resolveEditorDocument({ pathname: "/", context, locationSearch: location.search });
  },
  component: EditorSiteIndexPage,
});

function EditorSiteIndexPage() {
  const params = Route.useParams();
  const { document, pathname } = Route.useLoaderData();
  const { viewerCtx } = Route.useRouteContext();
  return (
    <EditorSiteView
      initialDocument={document}
      viewerCtx={viewerCtx}
      pathname={pathname}
      siteId={params.siteId}
    />
  );
}
