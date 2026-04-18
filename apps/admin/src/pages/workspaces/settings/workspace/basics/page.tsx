import { WorkspaceSettingsBasicsView } from "./components/workspace-settings-basics-view";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function WorkspaceSettingsBasicsPage() {
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  if (!workspaceId) {
    throw new Error("WORKSPACE_NOT_SELECTED");
  }
  return <WorkspaceSettingsBasicsView workspaceId={workspaceId} />;
}
