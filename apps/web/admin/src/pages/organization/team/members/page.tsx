import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";

import { OrganizationMembersDialogs } from "./members-dialogs";
import { OrganizationMembersTableSection } from "./members-table-section";
import { OrganizationMembersInviteAction, OrganizationMembersToolbar } from "./members-toolbar";
import { useOrganizationTeamMembers } from "./use-organization-team-members";

export function OrganizationTeamMembersPage() {
  const { t, openInviteDialog, toolbarProps, tableState, dialogsProps } =
    useOrganizationTeamMembers();

  return (
    <DefaultPage
      width="fixed"
      title={t("nav:NAV_SETTINGS_TEAM_MEMBER_LIST")}
      description={t("common:ORG_MEMBERS_DESC")}
      contentClassName="min-h-0"
      action={<OrganizationMembersInviteAction onInvite={openInviteDialog} />}
      extra={<OrganizationMembersToolbar {...toolbarProps} />}
    >
      <ContentGuard
        loading={tableState.isLoading}
        error={tableState.error}
        onRetry={() => void tableState.refetch()}
        empty={tableState.empty}
        loadingVariant="table"
        emptyTitle={t("common:ORG_MEMBERS_EMPTY_TITLE")}
        emptyDescription={t("common:ORG_MEMBERS_EMPTY_DESC")}
      >
        <OrganizationMembersTableSection
          table={tableState.table}
          pageData={tableState.pageData}
          onPaginationChange={tableState.onPaginationChange}
        />
      </ContentGuard>

      <OrganizationMembersDialogs {...dialogsProps} />
    </DefaultPage>
  );
}
