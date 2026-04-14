import { listMyWorkspaces } from "@/api/workspaces";
import { pickDefaultWorkspaceId } from "@/lib/routing/workspace-routing";

export interface PostAuthRouteDecision {
  path: string;
  workspaceId: string | null;
  onboardingRequired: boolean;
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
    onboarding: {
      status: "completed" as const,
      workspaceId: null,
    },
  }));

  const onboarding = workspaces.onboarding ?? {
    status: "completed" as const,
    workspaceId: null,
  };

  if (onboarding.status === "pending_workspace") {
    return {
      path: "/",
      workspaceId: null,
      onboardingRequired: true,
    };
  }

  if (onboarding.status === "pending_workspace_defaults") {
    return {
      path: "/",
      workspaceId: null,
      onboardingRequired: true,
    };
  }

  const workspaceId = pickDefaultWorkspaceId({
    workspaces: workspaces.items ?? [],
    lastWorkspaceId,
  });

  if (workspaceId) {
    return {
      path: "/",
      workspaceId,
      onboardingRequired: false,
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
      onboardingRequired: false,
    };
  }

  return {
    path: "/",
    workspaceId: null,
    onboardingRequired: false,
  };
}
