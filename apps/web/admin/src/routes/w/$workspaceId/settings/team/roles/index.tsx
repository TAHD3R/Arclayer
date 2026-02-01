import { createFileRoute } from "@tanstack/react-router";

import { TeamRolesView } from "@/views/team/TeamRolesView";

export const Route = createFileRoute("/w/$workspaceId/settings/team/roles/")({
  component: TeamRolesView,
});
