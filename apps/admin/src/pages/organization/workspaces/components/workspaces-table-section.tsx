import type { Row } from "@tanstack/react-table";
import { useCallback } from "react";

import type { OrganizationWorkspace } from "@/types/api";
import { AdminDataTableSection } from "@/components/common/admin-data-table-section";
import type { DataTableRowHeight } from "@arclayer/ui/data-table";

import type {
  OrganizationWorkspacesTranslateFn,
  OrganizationWorkspacesViewMode,
  WorkspaceMenuItem,
} from "../types";
import type { OrganizationWorkspaceTableHook } from "../hooks/use-organization-workspaces-tables";
import { WorkspacesCardGrid } from "./workspaces-card-grid";

interface WorkspacesContentSectionProps {
  viewMode: OrganizationWorkspacesViewMode;
  tableHook: OrganizationWorkspaceTableHook;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
  onRowClick?: (row: Row<OrganizationWorkspace>) => void;
  t: OrganizationWorkspacesTranslateFn;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  organizationId?: string;
  archived: boolean;
  searchInput: string;
  buildMenuItems: (ws: OrganizationWorkspace) => WorkspaceMenuItem[];
  onCardClick?: (ws: OrganizationWorkspace) => void;
}

export function WorkspacesContentSection(props: WorkspacesContentSectionProps) {
  if (props.viewMode === "card") {
    return (
      <WorkspacesCardGrid
        organizationId={props.organizationId}
        archived={props.archived}
        searchInput={props.searchInput}
        buildMenuItems={props.buildMenuItems}
        onCardClick={props.onCardClick}
        emptyTitle={props.emptyTitle}
        emptyDescription={props.emptyDescription}
        t={props.t}
      />
    );
  }

  const table = props.tableHook.table;
  const handlePaginationChange = useCallback(
    (nextPage: number, nextSize: number) => {
      if (nextSize !== table.getState().pagination.pageSize) {
        table.setPageSize(nextSize);
      }
      table.setPageIndex(Math.max(0, nextPage - 1));
    },
    [table],
  );

  return (
    <AdminDataTableSection
      table={table}
      emptyText={props.t("common:EMPTY_DESC")}
      emptyTitle={props.emptyTitle}
      emptyDescription={props.emptyDescription}
      loading={props.tableHook.isLoading}
      error={props.tableHook.error}
      onRetry={props.onRetry}
      pageData={props.tableHook.pageData}
      onPaginationChange={handlePaginationChange}
      t={props.t}
      rowHeight={props.rowHeight}
      wrapHeaders={props.wrapHeaders}
      refreshing={props.tableHook.isFetching && !props.tableHook.isLoading}
      onRowClick={props.onRowClick}
    />
  );
}
