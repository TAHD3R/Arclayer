"use client";

import {
  flexRender,
  type Cell,
  type Header,
  type Row,
  type Table as ReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type DataTablePresenterProps<TData> = {
  table: ReactTable<TData>;
  emptyText: string;
  className?: string;
  tableClassName?: string;
  rowClassName?: (row: Row<TData>, rowIndex: number) => string | undefined;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  cellClassName?: (cell: Cell<TData, unknown>) => string | undefined;
};

type AlignClass = "text-left" | "text-center" | "text-right";

function resolveHeaderAlignClass<TData>(header: Header<TData, unknown>): AlignClass {
  const meta = header.column.columnDef.meta;
  if (meta?.headerAlign === "left") return "text-left";
  if (meta?.headerAlign === "right") return "text-right";
  if (meta?.headerAlign === "center") return "text-center";

  if (meta?.kind === "actions" || header.column.id === "actions") return "text-right";
  if (meta?.kind === "select" || header.column.id === "select") return "text-center";

  return "text-left";
}

function resolveHeaderJustifyClass(align: AlignClass): string {
  if (align === "text-left") return "justify-start";
  if (align === "text-right") return "justify-end";
  return "justify-center";
}

function SortStateIcon(props: { state: false | "asc" | "desc" }) {
  if (props.state === "asc") return <ArrowUp className="size-3.5 text-foreground" />;
  if (props.state === "desc") return <ArrowDown className="size-3.5 text-foreground" />;
  return <ArrowUpDown className="size-3.5 text-muted-foreground/70" />;
}

export function DataTablePresenter<TData>(props: DataTablePresenterProps<TData>) {
  const {
    table,
    emptyText,
    className,
    tableClassName,
    rowClassName,
    headerCellClassName,
    cellClassName,
  } = props;

  return (
    <div className={cn("relative isolate rounded-md border bg-card overflow-auto", className)}>
      <Table className={tableClassName}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const alignClass = resolveHeaderAlignClass(header);
                const justifyClass = resolveHeaderJustifyClass(alignClass);
                const sortKey = String(header.column.columnDef.meta?.sortKey ?? "").trim();
                const canSort = Boolean(sortKey) && header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const ariaSort =
                  sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
                const content = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());

                return (
                  <TableHead
                    key={header.id}
                    aria-sort={canSort ? ariaSort : undefined}
                    className={cn(alignClass, headerCellClassName?.(header))}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className={cn(
                          "group inline-flex w-full items-center gap-1 rounded-sm px-1 py-1 transition-colors hover:bg-muted/50",
                          justifyClass,
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="truncate">{content}</span>
                        <SortStateIcon state={sorted} />
                      </button>
                    ) : (
                      content
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row, rowIndex) => (
              <TableRow key={row.id} className={rowClassName?.(row, rowIndex)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cellClassName?.(cell)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                className="h-24 text-center text-muted-foreground"
                colSpan={table.getVisibleLeafColumns().length}
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
