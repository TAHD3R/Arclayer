import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceThemesView } from "@/pages/appearance/themes/page";

export const Route = createFileRoute("/w/$workspaceId/appearance/themes/")({
  component: WorkspaceThemesView,
});
