import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/extensions/")({
  staticData: { titleKey: "nav:NAV_EXTENSIONS" },
});
