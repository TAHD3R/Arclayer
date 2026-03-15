import { useSearch } from "@tanstack/react-router";

import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";

import { OrganizationMembersDialogs } from "./components/members-dialogs";
import { OrganizationMembersTableSection } from "./components/members-table-section";
import { OrganizationMembersInviteAction } from "./components/members-toolbar";
import { useOrganizationTeamMembers } from "./hooks/use-organization-team-members";

export function OrganizationTeamMembersPage() {
  const { q, memberId } = useSearch({ from: "/o/$orgId/team/members/" });
  const { t, openInviteDialog, toolbarProps, tableState, dialogsProps } =
    useOrganizationTeamMembers({
      initialSearchQuery: q,
      initialInspectMemberId: memberId,
    });

  return (
    <DefaultPage
      title={t("nav:NAV_SETTINGS_TEAM_MEMBER_LIST")}
      description={t("common:ORG_MEMBERS_DESC")}
      contentClassName="min-h-0"
      action={<OrganizationMembersInviteAction onInvite={openInviteDialog} />}
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
          tableId={tableState.tableId}
          table={tableState.table}
          pageData={tableState.pageData}
          onPaginationChange={tableState.onPaginationChange}
          searchInput={toolbarProps.searchInput}
          onSearchInputChange={toolbarProps.onSearchInputChange}
          filters={toolbarProps.filters}
          onFiltersChange={toolbarProps.onFiltersChange}
          roleOptions={toolbarProps.roleOptions}
          isFetching={tableState.isFetching}
          isLoading={tableState.isLoading}
          onRefresh={tableState.refetch}
          onResetColumnVisibility={tableState.resetColumnVisibility}
        />
      </ContentGuard>

      <OrganizationMembersDialogs {...dialogsProps} />
    </DefaultPage>
  );
}
