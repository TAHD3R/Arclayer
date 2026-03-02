import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";

import { useOrganizationSettingsBasicsController } from "../hooks/use-organization-settings-basics-controller";
import { OrganizationSettingsAssignRoleDialog } from "./organization-settings-assign-role-dialog";
import { OrganizationSettingsBasicsForm } from "./organization-settings-basics-form";

export function OrganizationSettingsBasicsView(props: { organizationId: string }) {
  const c = useOrganizationSettingsBasicsController({ organizationId: props.organizationId });

  if (c.myOrgQuery.isLoading && !c.myOrgQuery.data) {
    return (
      <DefaultPage
        title={c.t("settings:SETTINGS_ORG_TITLE")}
        description={c.t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard loading loadingVariant="form" />
      </DefaultPage>
    );
  }

  if (c.myOrgQuery.isError) {
    return (
      <DefaultPage
        title={c.t("settings:SETTINGS_ORG_TITLE")}
        description={c.t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard
          loading={false}
          error={c.myOrgQuery.error}
          onRetry={() => void c.myOrgQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  if (!c.canManageOrganization) {
    return (
      <DefaultPage
        title={c.t("settings:SETTINGS_ORG_TITLE")}
        description={c.t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard loading={false} error={c.forbiddenError} hideRetry />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      title={c.t("settings:SETTINGS_ORG_TITLE")}
      description={c.t("settings:SETTINGS_ORG_DESC")}
      width="fixed"
    >
      <ContentGuard
        loading={c.coreQuery.isLoading || c.rolesQuery.isLoading}
        error={c.coreQuery.error || c.rolesQuery.error}
        onRetry={() => {
          void c.coreQuery.refetch();
          void c.rolesQuery.refetch();
        }}
      >
        <OrganizationSettingsBasicsForm controller={c} />
        <OrganizationSettingsAssignRoleDialog controller={c} />
      </ContentGuard>
    </DefaultPage>
  );
}
