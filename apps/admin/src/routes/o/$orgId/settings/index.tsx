import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/settings/")({
  staticData: { titleKey: "nav:NAV_ORG_SETTINGS" },
});
