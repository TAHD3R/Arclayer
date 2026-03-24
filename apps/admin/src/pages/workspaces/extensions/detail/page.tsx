import { useParams } from "@tanstack/react-router";

import { ExtensionDetailPage } from "@/pages/workspaces/extensions/detail/components/extension-detail-view";

import { useWorkspaceExtensionDetail } from "./hooks/use-workspace-extension-detail";

export function WorkspaceExtensionDetailPage() {
  const { workspaceId, extensionSlug } = useParams({
    from: "/w/$workspaceId/extensions/$extensionSlug/",
  });
  const detail = useWorkspaceExtensionDetail({ workspaceId, extensionRef: extensionSlug });

  return <ExtensionDetailPage {...detail} />;
}
