import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceContentPagesPage } from "@/pages/workspaces/content/pages/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/pages/")({
  component: WorkspaceContentPagesPage,
});
