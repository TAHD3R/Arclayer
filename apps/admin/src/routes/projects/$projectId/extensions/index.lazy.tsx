import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceExtensionsPage } from "@/pages/workspaces/extensions/page";

export const Route = createLazyFileRoute("/projects/$projectId/extensions/")({
  component: WorkspaceExtensionsPage,
});
