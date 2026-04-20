import { ExtensionDetailPage } from "@/pages/projects/extensions/detail/components/extension-detail-view";

import { useWorkspaceExtensionDetail } from "./hooks/use-workspace-extension-detail";

export function WorkspaceExtensionDetailPage(props: {
  projectId: string;
  extensionSlug: string;
  backTo: string;
}) {
  const detail = useWorkspaceExtensionDetail({
    workspaceId: props.projectId,
    extensionRef: props.extensionSlug,
    backTo: props.backTo,
  });

  return <ExtensionDetailPage {...detail} />;
}
