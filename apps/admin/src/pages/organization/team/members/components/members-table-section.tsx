import { type Table as ReactTable } from "@tanstack/react-table";
import { Search, X } from "@arclayer/ui/icons/lucide-animated";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataPaginationControls } from "@/components/common/data-pagination-controls";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import {
  DataTablePresenter,
  DataTableToolbarTools,
  useDataTableDensityPreference,
} from "@arclayer/ui/data-table";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@arclayer/ui/input-group";
import type { PageData } from "@arclayer/ui/data-table";
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
      <InputGroup className="w-[min(100%,22.5rem)]">
        <InputGroupAddon>
          <Search className="size-4 text-label-secondary" />
        </InputGroupAddon>
        <InputGroupInput
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
        />
        {searchInput ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={t("common:CLEAR")}
              size="icon-xs"
              onClick={() => onSearchInputChange("")}
            >
              <X className="size-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>

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
          <DataPaginationControls
            page={pageData.page}
            size={pageData.size}
            total={pageData.total}
            onChange={onPaginationChange}
            t={t}
          />
        </div>
      ) : null}
    </>
  );
}
