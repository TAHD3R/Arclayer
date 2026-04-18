import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceActivityPage } from "@/pages/workspaces/activity/page";

export const Route = createLazyFileRoute("/projects/$projectId/activity/")({
  component: WorkspaceActivityPage,
});
