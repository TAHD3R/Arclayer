import { type Table as ReactTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { AdminDataTableSection } from "@/components/common/admin-data-table-section";
import type { OrganizationMember } from "@/types/api";
import type { PageData, DataTableRowHeight } from "@arclayer/ui/data-table";

interface OrganizationMembersTableSectionProps {
  table: ReactTable<OrganizationMember>;
  pageData: PageData<OrganizationMember> | undefined;
  onPaginationChange: (nextPage: number, nextSize: number) => void;
  isFetching: boolean;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => Promise<unknown> | void;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
}

export function OrganizationMembersTableSection({
  table,
  pageData,
  onPaginationChange,
  isFetching,
  isLoading,
  error,
  onRetry,
  rowHeight,
  wrapHeaders,
}: OrganizationMembersTableSectionProps) {
  const { t } = useTranslation(["common", "team"]);

  return (
    <AdminDataTableSection
      table={table}
      emptyText={t("team:TEAM_EMPTY_TABLE")}
      emptyTitle={t("common:ORG_MEMBERS_EMPTY_TITLE")}
      emptyDescription={t("common:ORG_MEMBERS_EMPTY_DESC")}
      loading={isLoading}
      error={error}
      onRetry={() => void onRetry?.()}
      pageData={pageData}
      onPaginationChange={onPaginationChange}
      t={t}
      rowHeight={rowHeight}
      wrapHeaders={wrapHeaders}
      refreshing={isFetching && !isLoading}
    />
  );
}
