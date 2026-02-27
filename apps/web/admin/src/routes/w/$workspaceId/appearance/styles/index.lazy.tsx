import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceGlobalStylesPage } from "@/pages/workspaces/appearance/styles/page";

export const Route = createLazyFileRoute("/w/$workspaceId/appearance/styles/")({
  component: WorkspaceGlobalStylesPage,
});
