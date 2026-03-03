import type { Row } from "@tanstack/react-table";

import type { OrganizationWorkspace } from "@/types/api";
import { ContentGuard } from "@/components/common/content-guard";
import { DataTablePresenter } from "@celestial/ui/data-table";

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
  // Card mode props
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
  const empty = !props.tableHook.isLoading && props.tableHook.items.length === 0;

  return (
    <ContentGuard
      loading={props.tableHook.isLoading}
      error={props.tableHook.error}
      onRetry={props.onRetry}
      empty={empty}
      loadingVariant="table"
      emptyTitle={props.emptyTitle}
      emptyDescription={props.emptyDescription}
      className="py-4"
    >
      <DataTablePresenter
        table={table}
        emptyText={props.t("common:EMPTY_DESC")}
        onRowClick={props.onRowClick}
      />
    </ContentGuard>
  );
}
