import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/")({
  staticData: { titleKey: "nav:NAV_DASHBOARD" },
});
