import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceOverviewPage } from "@/pages/workspaces/overview/page";

export const Route = createLazyFileRoute("/projects/$projectId/")({
  component: WorkspaceOverviewPage,
});
