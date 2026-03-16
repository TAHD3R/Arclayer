import { getBootstrapState, repairBootstrapState } from "@/api/bootstrap";
import { listMyWorkspaces } from "@/api/workspaces";
import { pickDefaultWorkspaceId, workspaceHomePath } from "@/lib/routing/workspace-routing";

export interface PostAuthRouteDecision {
  path: string;
  workspaceId: string | null;
  repaired: boolean;
}

/**
 * Post-auth routing policy (workspace-first):
 * - Prefer the remembered workspace when it still exists.
 * - Auto-enter the only workspace when there is exactly one.
 * - Otherwise send the user to account workspaces management.
 */
export async function resolvePostAuthRoute(params: {
  lastWorkspaceId: string | null;
  attemptRepair?: boolean;
}): Promise<PostAuthRouteDecision> {
  const { lastWorkspaceId, attemptRepair = true } = params;

  let repaired = false;
  let state = await getBootstrapState().catch(() => null);
  if (state && !state.ready && state.repairRequired && attemptRepair) {
    const repair = await repairBootstrapState().catch(() => null);
    repaired = Boolean(repair?.repaired);
    state = await getBootstrapState().catch(() => state);
  }

  const workspaces = await listMyWorkspaces().catch(() => ({ items: [] }));
  const workspaceId = pickDefaultWorkspaceId({
    workspaces: workspaces.items ?? [],
    lastWorkspaceId,
  });

  if (workspaceId) {
    return {
      path: workspaceHomePath(workspaceId),
      workspaceId,
      repaired,
    };
  }

  if (state?.ready || (workspaces.items ?? []).length > 0) {
    return {
      path: "/account/workspaces",
      workspaceId: null,
      repaired,
    };
  }

  return {
    path: "/account/workspaces",
    workspaceId: null,
    repaired,
  };
}
