import { WorkspaceKnowledgeView } from "./workspace-knowledge-view";

export function WorkspaceKnowledgePage({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceKnowledgeView workspaceId={workspaceId} />;
}
