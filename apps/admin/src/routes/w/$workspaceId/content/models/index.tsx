import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/content/models/")({
  staticData: { titleKey: "nav:NAV_CONTENT_MODELS" },
});
