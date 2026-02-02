import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { resolveEditorDocument } from "../-resolveEditorDocument";
import { EditorSiteView } from "./-EditorSiteView";

export const Route = createFileRoute("/editor/site/$siteId/$")({
  loader: async ({ params, context, location }) => {
    const pathname = "/" + (params._splat ?? "");
    return await resolveEditorDocument({ pathname, context, locationSearch: location.search });
  },
  component: EditorSiteSplatPage,
});

function EditorSiteSplatPage() {
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
