import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/")({
  staticData: { titleKey: "nav:NAV_ORG_OVERVIEW" },
});
