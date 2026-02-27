import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsPage } from "@/pages/workspaces/settings/workspace/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/")({
  component: WorkspaceSettingsPage,
});
