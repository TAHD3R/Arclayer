import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/")({
  staticData: { titleKey: "nav:NAV_DASHBOARD" },
});
