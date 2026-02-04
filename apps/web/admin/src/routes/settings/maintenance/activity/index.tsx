import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { WorkspaceActivityPage } from "@/pages/settings/maintenance/activity/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/settings/maintenance/activity/")({
  component: SettingsMaintenanceActivityRoutePage,
});

function SettingsMaintenanceActivityRoutePage() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  useEffect(() => {
    // Workspace-scoped maintenance pages should be rendered under `/w/:workspaceId/*` when possible.
    if (!workspaceId) return;
    void navigate({ to: `/w/${workspaceId}/settings/maintenance/activity`, replace: true });
  }, [navigate, workspaceId]);

  // Fallback: allow rendering without workspace selection (page will show a reasonable state).
  return <WorkspaceActivityPage />;
}
