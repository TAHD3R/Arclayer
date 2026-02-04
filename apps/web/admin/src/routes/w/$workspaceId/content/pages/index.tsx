import { createFileRoute } from "@tanstack/react-router";

import { ContentPagesIndexView } from "@/pages/content/pages/page";

export const Route = createFileRoute("/w/$workspaceId/content/pages/")({
  component: ContentPagesIndexView,
});
