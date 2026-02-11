import { createFileRoute } from "@tanstack/react-router";

import { TeamRolesView } from "@/pages/workspaces/team/roles/page";

export const Route = createFileRoute("/w/$workspaceId/team/roles")({
  component: TeamRolesView,
});
