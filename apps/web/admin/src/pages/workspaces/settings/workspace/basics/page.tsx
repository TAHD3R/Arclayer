import { useParams } from "@tanstack/react-router";

import { WorkspaceSettingsBasicsView } from "./components/workspace-settings-basics-view";

export function WorkspaceSettingsBasicsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/settings/workspace/basics/" });
  return <WorkspaceSettingsBasicsView workspaceId={workspaceId} />;
}
