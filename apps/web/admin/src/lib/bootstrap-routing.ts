import { getBootstrapState, repairBootstrapState } from "@/api/bootstrap";
import { listMyWorkspaces } from "@/api/workspaces";
import { pickDefaultWorkspaceId, workspaceHomePath } from "@/lib/workspace-routing";

export interface PostAuthRouteDecision {
  path: string;
  workspaceId: string | null;
  repaired: boolean;
}

function normalizePath(path: string | null | undefined): string {
  const raw = String(path || "").trim();
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  return raw;
}

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

  if (state?.workspaceId) {
    return {
      path: normalizePath(state.nextPath) || workspaceHomePath(String(state.workspaceId)),
      workspaceId: String(state.workspaceId),
      repaired,
    };
  }

  const workspaces = await listMyWorkspaces().catch(() => ({ items: [] }));
  const fallbackWorkspaceId = pickDefaultWorkspaceId({
    workspaces: workspaces.items,
    lastWorkspaceId,
  });
  if (fallbackWorkspaceId) {
    return {
      path: workspaceHomePath(String(fallbackWorkspaceId)),
      workspaceId: String(fallbackWorkspaceId),
      repaired,
    };
  }

  return {
    path: "/",
    workspaceId: null,
    repaired,
  };
}
