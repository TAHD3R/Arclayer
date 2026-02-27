import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceExtensionDetailPage } from "@/pages/workspaces/extensions/detail/page";

export const Route = createLazyFileRoute("/w/$workspaceId/extensions/$extensionSlug/")({
  component: WorkspaceExtensionDetailPage,
});
