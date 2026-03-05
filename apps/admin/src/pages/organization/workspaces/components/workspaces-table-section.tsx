import { Input } from "antd";
import type { Row } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo } from "react";

import type { OrganizationWorkspace } from "@/types/api";
import { ContentGuard } from "@/components/common/content-guard";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import {
  DataTablePresenter,
  DataTableToolbarTools,
  useDataTableDensityPreference,
} from "@celestial/ui/data-table";

import type {
  OrganizationWorkspacesTranslateFn,
  OrganizationWorkspacesViewMode,
  WorkspaceMenuItem,
} from "../types";
import type { OrganizationWorkspaceTableHook } from "../hooks/use-organization-workspaces-tables";
import { WorkspacesCardGrid } from "./workspaces-card-grid";

interface WorkspacesContentSectionProps {
  tableId: string;
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
  const [density, setDensity] = useDataTableDensityPreference({ tableId: props.tableId });
  const toolsLabels = useMemo(() => buildDataTableToolsLabels(props.t), [props.t]);

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
  const toolbarLeft = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        value={props.tableHook.searchInput}
        onChange={(event) => props.tableHook.setSearchInput(event.target.value)}
        placeholder={props.t("common:ORG_WORKSPACES_SEARCH_PLACEHOLDER")}
        allowClear
        variant="filled"
        prefix={<Search className="size-4 text-label-secondary" />}
        className="max-w-[360px]"
      />
    </div>
  );

  const toolbarRight = (
    <DataTableToolbarTools
      table={table}
      density={density}
      onDensityChange={setDensity}
      onRefresh={() => void props.tableHook.refetch()}
      refreshing={props.tableHook.isFetching}
      onResetColumnVisibility={props.tableHook.resetColumnVisibility}
      labels={toolsLabels}
      components={{ IconButton: DataTableToolbarAntdIconButton }}
    />
  );

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
        toolbar={{ left: toolbarLeft, right: toolbarRight }}
        density={density}
        refreshing={props.tableHook.isFetching && !props.tableHook.isLoading}
      />
    </ContentGuard>
  );
}
