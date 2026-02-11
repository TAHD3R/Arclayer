import { Input, Pagination } from "antd";
import { flexRender, type Table } from "@tanstack/react-table";
import { Search } from "lucide-react";

import { PageState } from "@/components/common/page-state";
import { LoaderOne } from "@/components/ui/loader";
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface PageDataLike {
  page: number;
  size: number;
  total: number;
}

interface DataTableLike<TRow> {
  isLoading: boolean;
  isFetching: boolean;
  items: TRow[];
  error: unknown;
  refetch: () => Promise<unknown> | void;
  table: Table<TRow>;
  pageData?: PageDataLike | null;
  searchInput: string;
  setSearchInput: (value: string) => void;
}

interface TeamInvitationsTableSectionProps<TRow> {
  tableHook: DataTableLike<TRow>;
  placeholder: string;
  emptyTitle: string;
  emptyDescription: string;
  showSearch: boolean;
  t: TranslateFn;
}

export function TeamInvitationsTableSection<TRow>(props: TeamInvitationsTableSectionProps<TRow>) {
  const { tableHook, placeholder, emptyTitle, emptyDescription, showSearch, t } = props;
  const empty = !tableHook.isLoading && tableHook.items.length === 0;
  const table = tableHook.table;
  const pageData = tableHook.pageData;

  return (
    <div className="min-h-0 flex flex-col gap-4">
      {showSearch ? (
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <Input
              variant="borderless"
              value={tableHook.searchInput}
              onChange={(event) => tableHook.setSearchInput(event.target.value)}
              placeholder={placeholder}
              allowClear
              prefix={<Search className="size-4 text-muted-foreground" />}
              style={{ width: "100%" }}
            />
          </div>
          {tableHook.isFetching && !tableHook.isLoading ? <LoaderOne /> : null}
        </div>
      ) : null}

      <PageState
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
        empty={empty}
        loadingVariant="table"
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        className="flex-1 min-h-0"
      >
        <div className="rounded-md border overflow-auto flex-1 min-h-0">
          <UiTable>
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
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row, rowIndex) => {
                  const stripeClass = rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background";
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(stripeClass, "hover:bg-muted/40 transition-colors")}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
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
                    colSpan={table.getVisibleLeafColumns().length}
                  >
                    {t("team:TEAM_EMPTY_TABLE")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </UiTable>
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
              onChange={(nextPage, nextSize) => {
                if (
                  typeof nextSize === "number" &&
                  nextSize !== table.getState().pagination.pageSize
                ) {
                  table.setPageSize(nextSize);
                }
                table.setPageIndex(Math.max(0, nextPage - 1));
              }}
            />
          </div>
        ) : null}
      </PageState>
    </div>
  );
}
