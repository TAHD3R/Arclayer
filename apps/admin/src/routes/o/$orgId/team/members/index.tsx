import { createFileRoute } from "@tanstack/react-router";

type OrganizationTeamMembersSearch = {
  q?: string;
  memberId?: string;
};

export const Route = createFileRoute("/o/$orgId/team/members/")({
  staticData: { titleKey: "nav:NAV_ORG_DIRECTORY_MEMBERS" },
  validateSearch: (search: Record<string, unknown>): OrganizationTeamMembersSearch => {
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
