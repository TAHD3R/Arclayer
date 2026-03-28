import { useParams } from "@tanstack/react-router";

import { WorkspaceSettingsContentView } from "./components/workspace-settings-content-view";

export function WorkspaceSettingsContentPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/settings/workspace/content/" });
  return <WorkspaceSettingsContentView workspaceId={workspaceId} />;
}
