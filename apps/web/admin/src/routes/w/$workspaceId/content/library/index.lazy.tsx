import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentLibraryPage } from "@/pages/workspaces/content/library/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/library/")({
  component: ContentLibraryPage,
});
