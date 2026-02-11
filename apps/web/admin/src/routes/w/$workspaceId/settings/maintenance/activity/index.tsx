import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceActivityPage } from "@/pages/workspaces/settings/maintenance/activity/page";

export const Route = createFileRoute("/w/$workspaceId/settings/maintenance/activity/")({
  component: () => <WorkspaceActivityPage />,
});
