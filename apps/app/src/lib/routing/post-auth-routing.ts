import { listMyWorkspaces } from "@/api/workspaces";
import { pickDefaultWorkspace, projectsHomePath } from "@/lib/routing/workspace-routing";

export interface PostAuthRouteDecision {
  path: string;
  workspaceId: string | null;
  projectId: string | null;
  onboardingRequired: boolean;
}

export async function resolvePostAuthRoute(params: {
  lastWorkspaceId: string | null;
}): Promise<PostAuthRouteDecision> {
  const { lastWorkspaceId } = params;

  const workspaces = await listMyWorkspaces();

  const onboarding = workspaces.onboarding ?? {
    status: "completed" as const,
    workspaceId: null,
  };

  if (onboarding.status === "pending_workspace") {
    return {
      path: "/welcome",
      workspaceId: null,
      projectId: null,
      onboardingRequired: true,
    };
  }

  if (onboarding.status === "pending_workspace_defaults") {
    return {
      path: "/welcome",
      workspaceId: null,
      projectId: null,
      onboardingRequired: true,
    };
  }

  const workspace = pickDefaultWorkspace({
    workspaces: workspaces.items ?? [],
    lastWorkspaceId,
  });

  if (workspace) {
    return {
      path: "/",
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId ?? null,
      onboardingRequired: false,
    };
  }

  return {
    path: projectsHomePath(),
    workspaceId: null,
    projectId: null,
    onboardingRequired: false,
  };
}
