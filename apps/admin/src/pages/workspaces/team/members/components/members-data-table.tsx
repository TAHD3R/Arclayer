import { type Table as ReactTable } from "@tanstack/react-table";

import { DataTablePresenter } from "@celestial/ui/data-table";
import type { TeamMember } from "@/types/api";

interface TeamMembersDataTableProps {
  table: ReactTable<TeamMember>;
  emptyText: string;
}

export function TeamMembersDataTable({ table, emptyText }: TeamMembersDataTableProps) {
  return <DataTablePresenter table={table} className="flex-1 min-h-0" emptyText={emptyText} />;
}
