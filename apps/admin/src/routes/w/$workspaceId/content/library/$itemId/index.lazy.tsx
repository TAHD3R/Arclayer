import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentLibraryArticleEditorPage } from "@/pages/workspaces/content/library/article-editor/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/library/$itemId/")({
  component: ContentLibraryArticleEditorRoute,
});

function ContentLibraryArticleEditorRoute() {
  const { workspaceId, itemId } = Route.useParams();

  return <ContentLibraryArticleEditorPage workspaceId={workspaceId} itemId={itemId} />;
}
