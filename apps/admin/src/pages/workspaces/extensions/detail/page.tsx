import { ExtensionDetailPage } from "@/pages/workspaces/extensions/detail/components/extension-detail-view";

import { useWorkspaceExtensionDetail } from "./hooks/use-workspace-extension-detail";

export function WorkspaceExtensionDetailPage(props: {
  workspaceId: string;
  extensionSlug: string;
  backTo: string;
}) {
  const detail = useWorkspaceExtensionDetail({
    workspaceId: props.workspaceId,
    extensionRef: props.extensionSlug,
    backTo: props.backTo,
  });

  return <ExtensionDetailPage {...detail} />;
}
