import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsContentStrategyPage } from "@/pages/workspaces/settings/workspace/content-strategy/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/content-strategy/")({
  component: WorkspaceSettingsContentStrategyPage,
});
