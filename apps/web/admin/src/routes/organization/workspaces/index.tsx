import { createFileRoute } from "@tanstack/react-router";

import { OrganizationWorkspacesPage } from "@/pages/organization/workspaces/page";

export const Route = createFileRoute("/organization/workspaces/")({
  component: OrganizationWorkspacesPage,
});
