import { useParams } from "@tanstack/react-router";

import { ExtensionDetailPage } from "@/pages/_shared/extensions/components/extension-detail-page";

import { useWorkspaceExtensionDetail } from "./hooks/use-workspace-extension-detail";

export function WorkspaceExtensionDetailPage() {
  const { workspaceId, extensionSlug } = useParams({
    from: "/w/$workspaceId/extensions/$extensionSlug/",
  });
  const detail = useWorkspaceExtensionDetail({ workspaceId, extensionSlug });

  return <ExtensionDetailPage {...detail} />;
}
