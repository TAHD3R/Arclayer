import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsCollaborationPage } from "@/pages/workspaces/settings/workspace/collaboration/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/collaboration/")({
  component: WorkspaceSettingsCollaborationPage,
});
