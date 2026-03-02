import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationWorkspacesPage } from "@/pages/organization/workspaces/page";

export const Route = createLazyFileRoute("/o/$orgId/workspaces/")({
  component: OrganizationWorkspacesPage,
});
