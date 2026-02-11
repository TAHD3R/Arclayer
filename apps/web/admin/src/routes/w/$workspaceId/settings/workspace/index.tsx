import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsView } from "@/pages/workspaces/settings/workspace/page";

export const Route = createFileRoute("/w/$workspaceId/settings/workspace/")({
  component: WorkspaceSettingsRoutePage,
});

function WorkspaceSettingsRoutePage() {
  return <WorkspaceSettingsView />;
}
