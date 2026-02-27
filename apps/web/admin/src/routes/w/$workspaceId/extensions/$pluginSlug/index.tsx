import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceExtensionDetailPage } from "@/pages/extensions/workspace-extension-detail/page";

export const Route = createFileRoute("/w/$workspaceId/extensions/$pluginSlug/")({
  component: WorkspaceExtensionDetailRoutePage,
});

function WorkspaceExtensionDetailRoutePage() {
  const { workspaceId, pluginSlug } = Route.useParams();
  return <WorkspaceExtensionDetailPage workspaceId={workspaceId} pluginSlug={pluginSlug} />;
}
