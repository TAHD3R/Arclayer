import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/assets/")({
  staticData: { titleKey: "nav:NAV_ASSETS" },
});
