import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ContentGuard } from "@/layouts/page-shell/content-guard";

import { useWorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsAssignRoleDialog } from "./workspace-settings-assign-role-dialog";
import { WorkspaceSettingsBasicsForm } from "./workspace-settings-basics-form";

export function WorkspaceSettingsBasicsView(props: { workspaceId: string }) {
  const c = useWorkspaceSettingsBasicsController({ workspaceId: props.workspaceId });

  const error = c.detailQuery.isError
    ? c.detailQuery.error
    : c.coreQuery.isError
      ? c.coreQuery.error
      : c.rolesQuery.isError
        ? c.rolesQuery.error
        : null;

  return (
    <DefaultPage
      title={c.t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={c.t("settings:SETTINGS_WORKSPACE_DESC")}
    >
      <ContentGuard
        loading={Boolean(
          (c.detailQuery.isLoading || c.rolesQuery.isLoading) && !c.detailQuery.data,
        )}
        loadingVariant="form"
        error={error}
        onRetry={() => {
          void c.detailQuery.refetch();
          void c.coreQuery.refetch();
          void c.rolesQuery.refetch();
        }}
      >
        <WorkspaceSettingsBasicsForm controller={c} />
        {c.isTeamWorkspace ? <WorkspaceSettingsAssignRoleDialog controller={c} /> : null}
      </ContentGuard>
    </DefaultPage>
  );
}
