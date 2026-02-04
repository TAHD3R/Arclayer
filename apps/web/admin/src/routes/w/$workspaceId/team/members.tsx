import { createFileRoute } from "@tanstack/react-router";

import { TeamMembersView } from "@/pages/team/members/page";

export const Route = createFileRoute("/w/$workspaceId/team/members")({
  component: TeamMembersView,
});
