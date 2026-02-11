import { flexRender, type ColumnDef, type Table as ReactTable } from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/api/team";

interface TeamMembersDataTableProps {
  table: ReactTable<TeamMember>;
  columns: Array<ColumnDef<TeamMember, unknown>>;
  emptyText: string;
}

export function TeamMembersDataTable({ table, columns, emptyText }: TeamMembersDataTableProps) {
  return (
    <div className="rounded-md border overflow-auto flex-1 min-h-0">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    header.column.id === "user"
                      ? "sticky left-0 z-20 bg-background min-w-72 w-72"
                      : undefined,
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row, rowIndex) => {
              const stripeClass = rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background";
              return (
                <TableRow
                  key={row.id}
                  className={cn(stripeClass, "hover:bg-muted/40 transition-colors")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.id === "user" ? "sticky left-0 z-10 min-w-72 w-72" : undefined,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                className="h-24 text-center text-muted-foreground"
                colSpan={columns.length}
              >
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
