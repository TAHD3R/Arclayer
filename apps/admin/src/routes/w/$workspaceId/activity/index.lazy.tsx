import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceActivityPage } from "@/pages/workspaces/activity/page";

export const Route = createLazyFileRoute("/w/$workspaceId/activity/")({
  component: WorkspaceActivityPage,
});
