import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsContentPage } from "@/pages/workspaces/settings/workspace/content/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/content/")({
  component: WorkspaceSettingsContentPage,
});
