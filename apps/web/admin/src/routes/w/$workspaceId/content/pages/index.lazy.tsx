import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentPagesIndexPage } from "@/pages/workspaces/content/pages/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/pages/")({
  component: ContentPagesIndexPage,
});
