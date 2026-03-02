import { createLazyFileRoute } from "@tanstack/react-router";

import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";

export const Route = createLazyFileRoute("/w/$workspaceId/team/roles/")({
  component: TeamRolesPage,
});
