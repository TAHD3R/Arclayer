import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceContentModelsPage } from "@/pages/workspaces/content/models/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/models/")({
  component: WorkspaceContentModelsPage,
});
