import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsBasicsPage } from "@/pages/workspaces/settings/workspace/basics/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/basics/")({
  component: WorkspaceSettingsBasicsPage,
});
