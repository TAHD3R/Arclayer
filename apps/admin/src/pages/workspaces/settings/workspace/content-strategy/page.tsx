import { useParams } from "@tanstack/react-router";

import { WorkspaceSettingsContentStrategyView } from "./components/workspace-settings-content-strategy-view";

export function WorkspaceSettingsContentStrategyPage() {
  const { workspaceId } = useParams({
    from: "/w/$workspaceId/settings/workspace/content-strategy/",
  });
  return <WorkspaceSettingsContentStrategyView workspaceId={workspaceId} />;
}
