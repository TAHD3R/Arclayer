import { Outlet, createFileRoute } from "@tanstack/react-router";

import { getProjectDetail } from "@/api/projects";
import { RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/projects/$projectId")({
  staticData: { titleKey: "nav:NAV_DASHBOARD" },
  beforeLoad: async ({ params }) => {
    const detail = await getProjectDetail(params.projectId);
    useWorkspaceStore.getState().setCurrentContext({
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
