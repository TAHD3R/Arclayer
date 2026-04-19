import { redirect } from "@tanstack/react-router";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function WorkspaceSettingsDangerPage() {
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  if (!workspaceId) {
    throw new Error("WORKSPACE_NOT_SELECTED");
  }
  throw redirect({ to: "/settings/workspace/general", replace: true });
}
