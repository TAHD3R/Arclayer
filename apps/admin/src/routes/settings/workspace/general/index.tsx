import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceGeneralSettingsPage } from "@/pages/settings/context-settings-pages";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/settings/workspace/general/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_WORKSPACE" },
  component: RouteComponent,
});

function RouteComponent() {
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  if (!workspaceId) {
    throw new Error("WORKSPACE_NOT_SELECTED");
  }
  return <WorkspaceGeneralSettingsPage workspaceId={workspaceId} />;
}
