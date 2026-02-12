import { createFileRoute } from "@tanstack/react-router";

import { ContentLibraryView } from "@/pages/workspaces/content/library/page";

export const Route = createFileRoute("/w/$workspaceId/content/library/")({
  component: ContentLibraryView,
});
