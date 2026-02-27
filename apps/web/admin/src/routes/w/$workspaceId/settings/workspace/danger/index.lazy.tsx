import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsDangerPage } from "@/pages/workspaces/settings/workspace/danger/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/danger/")({
  component: WorkspaceSettingsDangerPage,
});
