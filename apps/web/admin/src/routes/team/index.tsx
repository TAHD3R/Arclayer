import { createFileRoute } from "@tanstack/react-router";

import { TeamMembersView } from "@/views/team/TeamMembersView";

export const Route = createFileRoute("/team/")({
  component: TeamMembersView,
});
