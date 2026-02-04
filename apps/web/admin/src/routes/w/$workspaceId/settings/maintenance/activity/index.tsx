import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceActivityPage } from "@/pages/settings/maintenance/activity/page";

export const Route = createFileRoute("/w/$workspaceId/settings/maintenance/activity/")({
  component: () => <WorkspaceActivityPage />,
});
