import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { TeamRolesView } from "@/views/team/TeamRolesView";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

export const Route = createFileRoute("/settings/team/roles/")({
  component: TeamRolesRoutePage,
});

function TeamRolesRoutePage() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  useEffect(() => {
    if (!workspaceId) return;
    void navigate({ to: `/w/${workspaceId}/settings/team/roles`, replace: true });
  }, [navigate, workspaceId]);

  // Fallback: if workspace isn't selected yet, still render the view and let it show an empty state.
  return <TeamRolesView />;
}
