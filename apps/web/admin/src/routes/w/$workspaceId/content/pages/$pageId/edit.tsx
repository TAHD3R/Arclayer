import { createFileRoute } from "@tanstack/react-router";

import { ContentPageEditorView } from "@/pages/content/pages/editor";

export const Route = createFileRoute("/w/$workspaceId/content/pages/$pageId/edit")({
  component: () => {
    const { workspaceId, pageId } = Route.useParams();
    return <ContentPageEditorView workspaceId={workspaceId} pageId={pageId} />;
  },
});
