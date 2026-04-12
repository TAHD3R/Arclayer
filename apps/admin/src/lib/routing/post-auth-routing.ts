import { listMyWorkspaces } from "@/api/workspaces";
import { pickDefaultWorkspaceId } from "@/lib/routing/workspace-routing";

export interface PostAuthRouteDecision {
  path: string;
  workspaceId: string | null;
}

export async function resolvePostAuthRoute(params: {
  lastWorkspaceId: string | null;
}): Promise<PostAuthRouteDecision> {
  const { lastWorkspaceId } = params;

  const workspaces = await listMyWorkspaces().catch(() => ({ items: [] }));
  const workspaceId = pickDefaultWorkspaceId({
    workspaces: workspaces.items ?? [],
    lastWorkspaceId,
  });

  if (workspaceId) {
    return {
      path: "/",
      workspaceId,
    };
  }

  return {
    path: "/",
    workspaceId: null,
  };
}
