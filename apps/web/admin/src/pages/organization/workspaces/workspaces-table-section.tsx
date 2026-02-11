import { flexRender, type ColumnDef } from "@tanstack/react-table";

import type { OrganizationWorkspace } from "@/api/organization-workspaces";
import { PageState } from "@/components/common/page-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { OrganizationWorkspaceTableHook } from "./use-organization-workspaces-tables";

export function WorkspacesTableSection(props: {
  columns: Array<ColumnDef<OrganizationWorkspace, unknown>>;
  tableHook: OrganizationWorkspaceTableHook;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
  t: (key: string) => string;
}) {
  const table = props.tableHook.table;
  const empty = !props.tableHook.isLoading && props.tableHook.items.length === 0;

  return (
    <PageState
      loading={props.tableHook.isLoading}
      error={props.tableHook.error}
      onRetry={props.onRetry}
      empty={empty}
      loadingVariant="table"
      emptyTitle={props.emptyTitle}
      emptyDescription={props.emptyDescription}
      className="py-4"
    >
      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!table.getRowModel().rows.length ? (
              <TableRow>
                <TableCell
                  className="h-20 text-center text-muted-foreground"
                  colSpan={props.columns.length}
                >
                  {props.t("common:EMPTY_DESC")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </PageState>
  );
}
