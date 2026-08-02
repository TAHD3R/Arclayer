import { Outlet, createFileRoute } from "@tanstack/react-router";

import { getProjectDetail } from "@/api/projects";
import { RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/projects/$projectId")({
  staticData: { titleKey: "nav:NAV_DASHBOARD" },
  beforeLoad: async ({ params }) => {
    const workspaceState = useWorkspaceStore.getState();
    const cachedWorkspaceId =
      workspaceState.currentProjectId === params.projectId
        ? workspaceState.currentWorkspaceId
        : null;

    if (cachedWorkspaceId) {
      workspaceState.setCurrentContext({
        workspaceId: cachedWorkspaceId,
        projectId: params.projectId,
      });
      return;
    }

    const detail = await getProjectDetail(params.projectId);
    workspaceState.setCurrentContext({
      workspaceId: detail.project.workspaceId,
      projectId: detail.project.id,
    });
  },
  component: ProjectLayout,
  notFoundComponent: RouterDefaultNotFound,
});

function ProjectLayout() {
  return <Outlet />;
}
