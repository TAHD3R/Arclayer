import { createFileRoute } from "@tanstack/react-router";

import { TeamRolesView } from "@/pages/team/roles/page";

export const Route = createFileRoute("/w/$workspaceId/settings/team/roles/")({
  component: TeamRolesView,
});
