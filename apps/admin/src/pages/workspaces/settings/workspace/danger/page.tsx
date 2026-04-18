import { WorkspaceSettingsDangerView } from "./components/workspace-settings-danger-view";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function WorkspaceSettingsDangerPage() {
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  if (!workspaceId) {
    throw new Error("WORKSPACE_NOT_SELECTED");
  }
  return <WorkspaceSettingsDangerView workspaceId={workspaceId} />;
}
