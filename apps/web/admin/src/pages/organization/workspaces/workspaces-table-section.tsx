import type { Row } from "@tanstack/react-table";

import type { OrganizationWorkspace } from "@/api/organization-workspaces";
import { ContentGuard } from "@/components/common/content-guard";
import { DataTablePresenter } from "@/components/data-table";

import type { OrganizationWorkspaceTableHook } from "./use-organization-workspaces-tables";

export function WorkspacesTableSection(props: {
  tableHook: OrganizationWorkspaceTableHook;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
  onRowClick?: (row: Row<OrganizationWorkspace>) => void;
  t: (key: string) => string;
}) {
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
