import { WorkspaceSettingsContentView } from "./components/workspace-settings-content-view";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function WorkspaceSettingsContentPage() {
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  if (!workspaceId) {
    throw new Error("WORKSPACE_NOT_SELECTED");
  }
  return <WorkspaceSettingsContentView workspaceId={workspaceId} />;
}
