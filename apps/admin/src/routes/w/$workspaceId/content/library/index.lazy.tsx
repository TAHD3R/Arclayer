import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceContentLibraryPage } from "@/pages/workspaces/content/library/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/library/")({
  component: WorkspaceContentLibraryPage,
});
