import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceActivityPage } from "@/pages/workspaces/settings/maintenance/activity/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/maintenance/activity/")({
  component: WorkspaceActivityPage,
});
