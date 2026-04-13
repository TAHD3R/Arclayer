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

  const workspaces = await listMyWorkspaces().catch(() => ({
    items: [],
    switcher: {
      teams: [],
      personalSpace: {
        status: "pending" as const,
        workspace: null,
        retryAvailable: false,
        lastError: null,
      },
    },
    instanceSetup: { status: "ready" as const, repairReason: null },
  }));
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

  const personalSpaceWorkspaceId = workspaces.switcher.personalSpace.workspace?.workspaceId ?? null;
  if (
    !lastWorkspaceId &&
    workspaces.switcher.personalSpace.status === "ready" &&
    personalSpaceWorkspaceId &&
    (workspaces.switcher.teams?.length ?? 0) === 0
  ) {
    return {
      path: "/",
      workspaceId: personalSpaceWorkspaceId,
    };
  }

  return {
    path: "/",
    workspaceId: null,
  };
}
