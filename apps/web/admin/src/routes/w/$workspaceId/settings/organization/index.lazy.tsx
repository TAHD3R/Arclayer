import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceOrganizationRedirectPage } from "@/pages/workspaces/settings/organization-redirect/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/organization/")({
  component: WorkspaceOrganizationRedirectPage,
});
