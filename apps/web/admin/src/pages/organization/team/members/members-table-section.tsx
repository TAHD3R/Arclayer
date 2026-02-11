import { Pagination } from "antd";
import { flexRender, type Table as ReactTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import type { PageData } from "@/components/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { OrganizationMember } from "@/api/organization-members";

interface OrganizationMembersTableSectionProps {
  table: ReactTable<OrganizationMember>;
  pageData: PageData<OrganizationMember> | undefined;
  onPaginationChange: (nextPage: number, nextSize: number) => void;
}

export function OrganizationMembersTableSection({
  table,
  pageData,
  onPaginationChange,
}: OrganizationMembersTableSectionProps) {
  const { t } = useTranslation(["team"]);

  return (
    <>
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
            {table.getRowModel().rows.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                className={cn(
                  rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background",
                  "transition-colors hover:bg-muted/40",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageData ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="text-muted-foreground text-sm">
            {t("team:TEAM_PAGINATION_TOTAL", {
              total: pageData.total,
              from: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
              to: Math.min(pageData.page * pageData.size, pageData.total),
            })}
          </div>
          <Pagination
            current={pageData.page}
            pageSize={pageData.size}
            total={pageData.total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            onChange={(nextPage, nextSize) => onPaginationChange(nextPage, nextSize)}
          />
        </div>
      ) : null}
    </>
  );
}
