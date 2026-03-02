import { useParams } from "@tanstack/react-router";

import { WorkspaceSettingsDangerView } from "./components/workspace-settings-danger-view";

export function WorkspaceSettingsDangerPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/settings/workspace/danger/" });
  return <WorkspaceSettingsDangerView workspaceId={workspaceId} />;
}
