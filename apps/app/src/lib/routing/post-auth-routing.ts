import { listMyWorkspaces } from "@/api/workspaces";
import { pickDefaultWorkspace, projectsHomePath } from "@/lib/routing/workspace-routing";

export interface PostAuthRouteDecision {
  path: string;
  workspaceId: string | null;
  projectId: string | null;
  onboardingRequired: boolean;
  /** Welcome flow mode to enter when onboardingRequired; null keeps the default first-run flow. */
  welcomeMode: "create-workspace" | null;
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
      welcomeMode: null,
    };
  }

  if (onboarding.status === "pending_workspace_defaults") {
    return {
      path: "/welcome",
      workspaceId: null,
      projectId: null,
      onboardingRequired: true,
      welcomeMode: null,
    };
  }

  const items = workspaces.items ?? [];

  // Workspace existence is the entry invariant: a user without any active
  // workspace membership must rebuild one through the create-workspace flow
  // before entering the platform, even after finishing first-run onboarding.
  if (items.length === 0) {
    return {
      path: "/welcome",
      workspaceId: null,
      projectId: null,
      onboardingRequired: true,
      welcomeMode: "create-workspace",
    };
  }

  const workspace = pickDefaultWorkspace({
    workspaces: items,
    lastWorkspaceId,
  });

  if (workspace) {
    return {
      path: "/",
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId ?? null,
      onboardingRequired: false,
      welcomeMode: null,
    };
  }

  return {
    path: projectsHomePath(),
    workspaceId: null,
    projectId: null,
    onboardingRequired: false,
    welcomeMode: null,
  };
}
