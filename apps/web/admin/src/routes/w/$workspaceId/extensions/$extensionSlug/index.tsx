import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/extensions/$extensionSlug/")({
  staticData: { titleKey: "nav:NAV_EXTENSIONS" },
});
