import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { ChromeTabs } from "@arclayer/ui/chrome-tabs";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import { WorkspaceSettingsTabs } from "../../components/workspace-settings-tabs";
import { useWorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsAssignRoleDialog } from "./workspace-settings-assign-role-dialog";
import { WorkspaceSettingsBasicsForm } from "./workspace-settings-basics-form";

export function WorkspaceSettingsBasicsView(props: { workspaceId: string; embedded?: boolean }) {
  const c = useWorkspaceSettingsBasicsController({ workspaceId: props.workspaceId });

  const error = c.detailQuery.isError
    ? c.detailQuery.error
    : c.coreQuery.isError
      ? c.coreQuery.error
      : c.rolesQuery.isError
        ? c.rolesQuery.error
        : null;

  const content = (
    <section className="min-w-0">
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
        <WorkspaceSettingsAssignRoleDialog controller={c} />
      </ContentGuard>
    </section>
  );

  if (props.embedded) {
    return content;
  }

  return (
    <ChromeTabs
      value="basics"
      onValueChange={(next) => c.onTabChange(next as WorkspaceSettingsTabKey)}
    >
      <DefaultPage
        title={c.t("settings:SETTINGS_WORKSPACE_TITLE")}
        description={c.t("settings:SETTINGS_WORKSPACE_DESC")}
        headerVisibility="always"
        extra={<WorkspaceSettingsTabs />}
      >
        {content}
      </DefaultPage>
    </ChromeTabs>
  );
}
