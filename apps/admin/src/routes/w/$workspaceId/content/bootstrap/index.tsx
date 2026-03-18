import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/content/bootstrap/")({
  staticData: { titleKey: "content:CONTENT_BOOTSTRAP_TITLE" },
});
