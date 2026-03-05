import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/team/")({
  staticData: { titleKey: "nav:NAV_ORG_DIRECTORY" },
});
