import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/team/members/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM_MEMBER_LIST" },
});
