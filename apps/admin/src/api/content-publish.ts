import { api } from "@/lib/http";

import type { WorkspacePublishImpact } from "@/types/api";

export async function getWorkspacePublishImpact(
  workspaceId: string,
): Promise<WorkspacePublishImpact> {
  return api.get<WorkspacePublishImpact>(`/workspaces/${workspaceId}/publish/impact`);
}
