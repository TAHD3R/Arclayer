import { type Table as ReactTable } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { DataTablePresenter, type DataTableDensity } from "@celestial/ui/data-table";
import type { TeamMember } from "@/types/api";

type DataTableToolbarSlots = {
  fullWidth?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
};

interface TeamMembersDataTableProps {
  table: ReactTable<TeamMember>;
  emptyText: string;
  toolbar?: DataTableToolbarSlots;
  density?: DataTableDensity;
}

export function TeamMembersDataTable({
  table,
  emptyText,
  toolbar,
  density,
}: TeamMembersDataTableProps) {
  return (
    <DataTablePresenter
      table={table}
      className="flex-1 min-h-0"
      emptyText={emptyText}
      toolbar={toolbar}
      density={density}
    />
  );
}
