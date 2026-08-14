import { WorkspaceDesignSystemsView } from "./workspace-design-systems-view";
import type { WorkspaceDesignSystemsController } from "./use-workspace-design-systems-controller";

export function WorkspaceDesignSystemsPage({
  workspaceId,
  onControllerChange,
}: {
  workspaceId: string;
  onControllerChange?: (controller: WorkspaceDesignSystemsController | null) => void;
}) {
  return (
    <WorkspaceDesignSystemsView workspaceId={workspaceId} onControllerChange={onControllerChange} />
  );
}
