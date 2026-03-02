import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/content/pages/")({
  staticData: { titleKey: "nav:NAV_CONTENT_PAGES" },
});
