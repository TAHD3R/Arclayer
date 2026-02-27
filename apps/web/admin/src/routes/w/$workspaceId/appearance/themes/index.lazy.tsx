import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceThemesPage } from "@/pages/workspaces/appearance/themes/page";

export const Route = createLazyFileRoute("/w/$workspaceId/appearance/themes/")({
  component: WorkspaceThemesPage,
});
