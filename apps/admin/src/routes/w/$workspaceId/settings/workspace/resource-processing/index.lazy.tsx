import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsResourceProcessingPage } from "@/pages/workspaces/settings/workspace/resource-processing/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/resource-processing/")(
  {
    component: WorkspaceSettingsResourceProcessingPage,
  },
);
