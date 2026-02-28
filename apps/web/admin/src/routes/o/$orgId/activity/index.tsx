import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/activity/")({
  staticData: { titleKey: "nav:NAV_ORG_ACTIVITY" },
});
