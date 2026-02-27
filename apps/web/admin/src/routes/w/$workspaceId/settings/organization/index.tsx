import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceOrganizationRedirectPage } from "@/pages/workspaces/settings/organization-redirect/page";

export const Route = createFileRoute("/w/$workspaceId/settings/organization/")({
  component: WorkspaceOrganizationRedirectPage,
});
