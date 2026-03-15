import { useSearch } from "@tanstack/react-router";

import { TeamMembersView } from "./components/team-members-view";

export function TeamMembersPage() {
  const { q, memberId } = useSearch({ from: "/w/$workspaceId/team/members/" });
  return <TeamMembersView initialSearchQuery={q} initialInspectMemberId={memberId} />;
}
