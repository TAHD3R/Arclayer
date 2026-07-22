import { WorkspaceDesignSystemsView } from "./workspace-design-systems-view";

export function WorkspaceDesignSystemsPage({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceDesignSystemsView workspaceId={workspaceId} />;
}
