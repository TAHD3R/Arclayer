import { createLazyFileRoute } from "@tanstack/react-router";

import { TeamMembersPage } from "@/pages/workspaces/team/members/page";

export const Route = createLazyFileRoute("/w/$workspaceId/team/members/")({
  component: TeamMembersPage,
});
