import { createFileRoute } from "@tanstack/react-router";

import { PluginsInstalledView } from "@/pages/plugins/installed/page";

export const Route = createFileRoute("/w/$workspaceId/plugins/installed/")({
  component: PluginsInstalledView,
});
