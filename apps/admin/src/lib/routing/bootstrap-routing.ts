import { getBootstrapState, repairBootstrapState } from "@/api/bootstrap";
import { listMyWorkspaces } from "@/api/workspaces";
import { pickDefaultWorkspaceId } from "@/lib/routing/workspace-routing";

export interface PostAuthRouteDecision {
  path: string;
  workspaceId: string | null;
  repaired: boolean;
}

/**
 * Post-auth routing policy (global-first):
 * - Repair bootstrap state when required.
 * - Preserve the remembered workspace in local state when it still exists.
 * - Always land on the global home entry after auth.
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
      path: "/",
      workspaceId,
      repaired,
    };
  }

  if (state?.ready || (workspaces.items ?? []).length > 0) {
    return {
      path: "/",
      workspaceId: null,
      repaired,
    };
  }

  return {
    path: "/",
    workspaceId: null,
    repaired,
  };
}
