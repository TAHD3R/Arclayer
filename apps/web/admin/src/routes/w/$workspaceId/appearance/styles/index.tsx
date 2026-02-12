import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceGlobalStylesView } from "@/pages/workspaces/appearance/styles/page";

export const Route = createFileRoute("/w/$workspaceId/appearance/styles/")({
  component: WorkspaceGlobalStylesView,
});
