import { WorkspaceGuidanceView } from "./workspace-guidance-view";

export function WorkspaceKnowledgePage({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceGuidanceView workspaceId={workspaceId} />;
}
