import { createFileRoute } from "@tanstack/react-router";

type WorkspaceTeamMembersSearch = {
  q?: string;
  memberId?: string;
};

export const Route = createFileRoute("/w/$workspaceId/team/members/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM_MEMBER_LIST" },
  validateSearch: (search: Record<string, unknown>): WorkspaceTeamMembersSearch => {
    const q = typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined;
    const memberId =
      typeof search.memberId === "string" && search.memberId.trim()
        ? search.memberId.trim()
        : undefined;
    return {
      ...(q ? { q } : {}),
      ...(memberId ? { memberId } : {}),
    };
  },
});
