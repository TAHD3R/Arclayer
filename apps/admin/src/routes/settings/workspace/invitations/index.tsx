import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceInvitationsSettingsPage } from "@/pages/settings/context-settings-pages";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/settings/workspace/invitations/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM_MEMBERS" },
  component: RouteComponent,
});

function RouteComponent() {
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  if (!workspaceId) {
    throw new Error("WORKSPACE_NOT_SELECTED");
  }
  return <WorkspaceInvitationsSettingsPage workspaceId={workspaceId} />;
}
