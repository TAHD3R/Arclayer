import { getBootstrapState, repairBootstrapState } from "@/api/bootstrap";
import { listMyWorkspaces } from "@/api/workspaces";

export interface PostAuthRouteDecision {
  path: string;
  workspaceId: string | null;
  repaired: boolean;
}

/**
 * Post-auth routing policy (org-first):
 * - Ready bootstrap -> land on organization overview (`/`).
 * - Not ready but user has at least one workspace -> land on `/`.
 * - No resolvable workspace -> `/` (org overview fallback).
 */
export async function resolvePostAuthRoute(params: {
  lastWorkspaceId: string | null;
  attemptRepair?: boolean;
}): Promise<PostAuthRouteDecision> {
  const { lastWorkspaceId, attemptRepair = true } = params;
  void lastWorkspaceId;

  let repaired = false;
  let state = await getBootstrapState().catch(() => null);
  if (state && !state.ready && state.repairRequired && attemptRepair) {
    const repair = await repairBootstrapState().catch(() => null);
    repaired = Boolean(repair?.repaired);
    state = await getBootstrapState().catch(() => state);
  }

  if (state?.ready) {
    return {
      path: "/",
      workspaceId: null,
      repaired,
    };
  }

  const workspaces = await listMyWorkspaces().catch(() => ({ items: [] }));
  if ((workspaces.items ?? []).length > 0) {
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
