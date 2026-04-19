import type { ReactNode } from "react";
import type { Row } from "@tanstack/react-table";

import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import type { DataTableRowHeight } from "@arclayer/ui/data-table";

import type {
  ProjectMenuItem,
  UserCenterProjectListItem,
  UserCenterProjectsTranslateFn,
  UserCenterProjectsViewMode,
} from "../types";
import type { ProjectEditingField } from "../hooks/use-project-menu-actions";
import type { UserCenterProjectTableHook } from "../hooks/use-usercenter-projects-tables";
import { ProjectsCardGrid } from "./projects-card-grid";

interface ProjectsContentSectionProps {
  viewMode: UserCenterProjectsViewMode;
  tableHook: UserCenterProjectTableHook;
  emptyTitle: string;
  emptyDescription: string;
  emptyExtra?: ReactNode;
  onRetry: () => void;
  onRowClick?: (row: Row<UserCenterProjectListItem>) => void;
  t: UserCenterProjectsTranslateFn;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  workspaceId?: string;
  archived: boolean;
  searchInput: string;
  buildMenuItems: (project: UserCenterProjectListItem) => ProjectMenuItem[];
  onPrepareProjectMenu: (projectId: string) => void;
  editingProjectId: string | null;
  editingProjectField: ProjectEditingField | null;
  editingProjectName: string;
  editingProjectDescription: string;
  onEditingProjectNameChange: (value: string) => void;
  onEditingProjectDescriptionChange: (value: string) => void;
  onCommitProjectEdit: (project: UserCenterProjectListItem, field: ProjectEditingField) => void;
  onCancelProjectEdit: () => void;
  appendCard?: ReactNode;
  disableProjectNavigation?: boolean;
  onCardClick?: (project: UserCenterProjectListItem) => void;
  toolbar?: ReactNode;
}

export function ProjectsContentSection(props: ProjectsContentSectionProps) {
  if (props.viewMode === "card") {
    return (
      <ProjectsCardGrid
        workspaceId={props.workspaceId}
        archived={props.archived}
        searchInput={props.searchInput}
        buildMenuItems={props.buildMenuItems}
        onPrepareProjectMenu={props.onPrepareProjectMenu}
        editingProjectId={props.editingProjectId}
        editingProjectField={props.editingProjectField}
        editingProjectName={props.editingProjectName}
        editingProjectDescription={props.editingProjectDescription}
        onEditingProjectNameChange={props.onEditingProjectNameChange}
        onEditingProjectDescriptionChange={props.onEditingProjectDescriptionChange}
        onCommitProjectEdit={props.onCommitProjectEdit}
        onCancelProjectEdit={props.onCancelProjectEdit}
        disableProjectNavigation={props.disableProjectNavigation}
        onCardClick={props.onCardClick}
        emptyTitle={props.emptyTitle}
        emptyDescription={props.emptyDescription}
        emptyExtra={props.emptyExtra}
        appendCard={props.appendCard}
        t={props.t}
      />
    );
  }

  const table = props.tableHook.table;

  return (
    <AdminDataTableSection
      table={table}
      emptyText={props.t("common:EMPTY_DESC")}
      emptyTitle={props.emptyTitle}
      emptyDescription={props.emptyDescription}
      emptyExtra={props.emptyExtra}
      loading={props.tableHook.isLoading}
      error={props.tableHook.error}
      onRetry={props.onRetry}
      infiniteScroll={props.tableHook.infiniteScroll}
      t={props.t}
      rowHeight={props.rowHeight}
      wrapHeaders={props.wrapHeaders}
      refreshing={props.tableHook.isFetching && !props.tableHook.isLoading}
      onRowClick={
        props.editingProjectId || props.disableProjectNavigation ? undefined : props.onRowClick
      }
      toolbar={props.toolbar}
    />
  );
}
