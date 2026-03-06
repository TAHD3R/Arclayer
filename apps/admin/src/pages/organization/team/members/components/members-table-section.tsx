import { Input as AntInput, Pagination } from "antd";
import { type Table as ReactTable } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import {
  DataTablePresenter,
  DataTableToolbarTools,
  useDataTableDensityPreference,
} from "@celestial/ui/data-table";
import type { PageData } from "@celestial/ui/data-table";
import type { OrganizationMember } from "@/types/api";
import { MembersFilterPopover, type OrgMemberFilters } from "./members-filter-popover";

interface OrganizationMembersTableSectionProps {
  tableId: string;
  table: ReactTable<OrganizationMember>;
  pageData: PageData<OrganizationMember> | undefined;
  onPaginationChange: (nextPage: number, nextSize: number) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: OrgMemberFilters;
  onFiltersChange: (next: OrgMemberFilters) => void;
  roleOptions: Array<{ value: string; label: string }>;
  isFetching: boolean;
  isLoading: boolean;
  onRefresh: () => Promise<unknown> | void;
  onResetColumnVisibility?: () => void;
}

export function OrganizationMembersTableSection({
  tableId,
  table,
  pageData,
  onPaginationChange,
  searchInput,
  onSearchInputChange,
  filters,
  onFiltersChange,
  roleOptions,
  isFetching,
  isLoading,
  onRefresh,
  onResetColumnVisibility,
}: OrganizationMembersTableSectionProps) {
  const { t } = useTranslation(["common", "team"]);
  const [density, setDensity] = useDataTableDensityPreference({ tableId });
  const toolsLabels = useMemo(() => buildDataTableToolsLabels(t), [t]);

  const toolbarLeft = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <AntInput
        value={searchInput}
        onChange={(event) => onSearchInputChange(event.target.value)}
        placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
        allowClear
        variant="filled"
        prefix={<Search className="size-4 text-label-secondary" />}
        style={{ width: 360, maxWidth: "100%" }}
      />

      <MembersFilterPopover value={filters} onChange={onFiltersChange} roleOptions={roleOptions} />
    </div>
  );

  const toolbarRight = (
    <DataTableToolbarTools
      table={table}
      density={density}
      onDensityChange={setDensity}
      onRefresh={() => void onRefresh()}
      refreshing={isFetching}
      onResetColumnVisibility={onResetColumnVisibility}
      labels={toolsLabels}
      components={{ IconButton: DataTableToolbarAntdIconButton }}
    />
  );

  return (
    <>
      <DataTablePresenter
        table={table}
        emptyText={t("team:TEAM_EMPTY_TABLE")}
        toolbar={{ left: toolbarLeft, right: toolbarRight }}
        density={density}
        refreshing={isFetching && !isLoading}
      />

      {pageData ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="text-label-secondary text-footnote">
            {t("team:TEAM_PAGINATION_TOTAL", {
              total: pageData.total,
              start: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
              end: Math.min(pageData.page * pageData.size, pageData.total),
            })}
          </div>
          <Pagination
            current={pageData.page}
            pageSize={pageData.size}
            total={pageData.total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            onChange={(nextPage, nextSize) => onPaginationChange(nextPage, nextSize)}
          />
        </div>
      ) : null}
    </>
  );
}
