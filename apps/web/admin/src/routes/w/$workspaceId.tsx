import { Outlet, createFileRoute } from "@tanstack/react-router";

import { RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";

import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/w/$workspaceId")({
  beforeLoad: ({ params }) => {
    // Keep Zustand state in sync with the URL (URL is source-of-truth).
    // This runs before the route component renders, so workspace-scoped queries can rely on it.
    useWorkspaceStore.getState().setCurrentWorkspaceId(params.workspaceId);
  },
  component: WorkspaceLayout,
  notFoundComponent: RouterDefaultNotFound,
});

function WorkspaceLayout() {
  return <Outlet />;
}
