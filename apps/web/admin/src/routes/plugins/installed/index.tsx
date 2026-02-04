import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { PluginsInstalledView } from "@/pages/plugins/installed/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/plugins/installed/")({
  component: PluginsInstalledPage,
});

function PluginsInstalledPage() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  useEffect(() => {
    if (!workspaceId) return;
    void navigate({ to: `/w/${workspaceId}/plugins/installed`, replace: true });
  }, [navigate, workspaceId]);

  // Fallback: render workspace view; it will show empty state if workspace isn't selected.
  return <PluginsInstalledView />;
}
