import { WorkspaceGuidanceView } from "./workspace-guidance-view";
import type { WorkspaceGuidanceController } from "./use-workspace-guidance-controller";

export function WorkspaceKnowledgePage({
  workspaceId,
  onControllerChange,
}: {
  workspaceId: string;
  onControllerChange?: (controller: WorkspaceGuidanceController | null) => void;
}) {
  return (
    <WorkspaceGuidanceView workspaceId={workspaceId} onControllerChange={onControllerChange} />
  );
}
