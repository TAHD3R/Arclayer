import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { OrganizationSettingsView } from "@/pages/settings/organization/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/settings/organization/")({
  component: OrganizationSettingsRoutePage,
});

function OrganizationSettingsRoutePage() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  useEffect(() => {
    // Canonical path: if workspace is already selected, redirect to alias to keep Admin Shell consistent.
    if (!workspaceId) return;
    void navigate({ to: `/w/${workspaceId}/settings/organization`, replace: true });
  }, [navigate, workspaceId]);

  // Fallback: if workspace isn't selected yet, still render the page and let it show a proper state.
  return <OrganizationSettingsView />;
}
