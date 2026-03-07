import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceSiteBuilderPage } from "@/pages/workspaces/content/site-builder/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/site-builder/")({
  component: WorkspaceSiteBuilderPage,
});
