import { type Table as ReactTable } from "@tanstack/react-table";

import { DataTablePresenter } from "@/components/data-table";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/api/team";

interface TeamMembersDataTableProps {
  table: ReactTable<TeamMember>;
  emptyText: string;
}

export function TeamMembersDataTable({ table, emptyText }: TeamMembersDataTableProps) {
  return (
    <DataTablePresenter
      table={table}
      className="flex-1 min-h-0"
      emptyText={emptyText}
      headerCellClassName={(header) =>
        cn(
          header.column.id === "user" ? "sticky left-0 z-[2] bg-card min-w-72 w-72" : undefined,
        )
      }
      cellClassName={(cell) =>
        cn(cell.column.id === "user" ? "sticky left-0 z-[1] min-w-72 w-72" : undefined)
      }
      rowClassName={(_row, rowIndex) => {
        const stripeClass = rowIndex % 2 === 1 ? "bg-muted/20" : "bg-card";
        return cn(stripeClass, "hover:bg-muted/40 transition-colors");
      }}
    />
  );
}
