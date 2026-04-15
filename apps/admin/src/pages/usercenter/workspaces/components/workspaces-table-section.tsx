import { useCallback } from "react";
import type { ReactNode } from "react";
import type { Row } from "@tanstack/react-table";

import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import type { DataTableRowHeight } from "@arclayer/ui/data-table";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  UserCenterWorkspacesViewMode,
  WorkspaceMenuItem,
} from "../types";
import type { WorkspaceEditingField } from "../hooks/use-workspace-menu-actions";
import type { UserCenterWorkspaceTableHook } from "../hooks/use-usercenter-workspaces-tables";
import { WorkspacesCardGrid } from "./workspaces-card-grid";

interface WorkspacesContentSectionProps {
  viewMode: UserCenterWorkspacesViewMode;
  tableHook: UserCenterWorkspaceTableHook;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
  onRowClick?: (row: Row<UserCenterWorkspaceListItem>) => void;
  t: UserCenterWorkspacesTranslateFn;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  organizationId?: string;
  archived: boolean;
  searchInput: string;
  buildMenuItems: (ws: UserCenterWorkspaceListItem) => WorkspaceMenuItem[];
  onPrepareWorkspaceMenu: (workspaceId: string) => void;
  editingWorkspaceId: string | null;
  editingWorkspaceField: WorkspaceEditingField | null;
  editingWorkspaceName: string;
  editingWorkspaceDescription: string;
  onEditingWorkspaceNameChange: (value: string) => void;
  onEditingWorkspaceDescriptionChange: (value: string) => void;
  onCommitWorkspaceEdit: (
    workspace: UserCenterWorkspaceListItem,
    field: WorkspaceEditingField,
  ) => void;
  onCancelWorkspaceEdit: () => void;
  disableWorkspaceNavigation?: boolean;
  onCardClick?: (ws: UserCenterWorkspaceListItem) => void;
  toolbar?: ReactNode;
}

export function WorkspacesContentSection(props: WorkspacesContentSectionProps) {
  if (props.viewMode === "card") {
    return (
      <WorkspacesCardGrid
        organizationId={props.organizationId}
        archived={props.archived}
        searchInput={props.searchInput}
        buildMenuItems={props.buildMenuItems}
        onPrepareWorkspaceMenu={props.onPrepareWorkspaceMenu}
        editingWorkspaceId={props.editingWorkspaceId}
        editingWorkspaceField={props.editingWorkspaceField}
        editingWorkspaceName={props.editingWorkspaceName}
        editingWorkspaceDescription={props.editingWorkspaceDescription}
        onEditingWorkspaceNameChange={props.onEditingWorkspaceNameChange}
        onEditingWorkspaceDescriptionChange={props.onEditingWorkspaceDescriptionChange}
        onCommitWorkspaceEdit={props.onCommitWorkspaceEdit}
        onCancelWorkspaceEdit={props.onCancelWorkspaceEdit}
        disableWorkspaceNavigation={props.disableWorkspaceNavigation}
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
      onRowClick={
        props.editingWorkspaceId || props.disableWorkspaceNavigation ? undefined : props.onRowClick
      }
      toolbar={props.toolbar}
    />
  );
}
