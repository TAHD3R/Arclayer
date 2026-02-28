import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/extensions/$extensionSlug/")({
  staticData: { titleKey: "nav:NAV_EXTENSIONS" },
});
