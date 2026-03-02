import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsIntegrationsPage } from "@/pages/workspaces/settings/workspace/integrations/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/integrations/")({
  component: WorkspaceSettingsIntegrationsPage,
});
