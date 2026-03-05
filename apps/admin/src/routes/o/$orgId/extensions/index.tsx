import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/extensions/")({
  staticData: { titleKey: "nav:NAV_ORG_PLATFORM_EXTENSIONS" },
});
