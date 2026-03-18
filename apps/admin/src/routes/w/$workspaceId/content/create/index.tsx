import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/content/create/")({
  staticData: { titleKey: "content:CONTENT_BOOTSTRAP_CREATE_TITLE" },
});
