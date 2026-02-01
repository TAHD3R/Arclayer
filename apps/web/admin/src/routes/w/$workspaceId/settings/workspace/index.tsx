import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsView } from "@/views/settings/workspace/WorkspaceSettingsView";

export const Route = createFileRoute("/w/$workspaceId/settings/workspace/")({
  component: WorkspaceSettingsRoutePage,
});

function WorkspaceSettingsRoutePage() {
  return <WorkspaceSettingsView />;
}
