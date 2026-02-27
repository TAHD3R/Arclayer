import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceExtensionDetailPage } from "@/pages/extensions/workspace-extension-detail/page";

export const Route = createLazyFileRoute("/w/$workspaceId/extensions/$pluginSlug/")({
  component: WorkspaceExtensionDetailPage,
});
