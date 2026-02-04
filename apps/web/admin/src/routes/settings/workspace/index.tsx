import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { WorkspaceSettingsView } from "@/pages/settings/workspace/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/settings/workspace/")({
  component: WorkspaceSettingsRoutePage,
});

function WorkspaceSettingsRoutePage() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  useEffect(() => {
    if (!workspaceId) return;
    void navigate({ to: `/w/${workspaceId}/settings/workspace`, replace: true });
  }, [navigate, workspaceId]);

  // Fallback: if workspace isn't selected yet, still render the page and let it show a proper empty state.
  return <WorkspaceSettingsView />;
}
