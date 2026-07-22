import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

const PAGE_SIZES = [10, 20, 50, 100] as const;

export function AuditTablePagination<TData>(props: { table: Table<TData>; total: number }) {
  const { t } = useTranslation("platform");
  const { pageIndex, pageSize } = props.table.getState().pagination;
  const pageCount = props.table.getPageCount();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-footnote text-label-secondary">
      <span className="tabular-nums">
        {t("AUDIT_PAGINATION_SUMMARY", {
          page: pageCount ? pageIndex + 1 : 0,
          pages: pageCount,
          total: props.total,
        })}
      </span>
      <div className="flex items-center gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => props.table.setPageSize(Number(value))}
        >
          <SelectTrigger className="h-8 w-28" aria-label={t("AUDIT_PAGE_SIZE_LABEL")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" position="popper">
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {t("AUDIT_PAGE_SIZE_OPTION", { count: size })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={!props.table.getCanPreviousPage()}
          aria-label={t("AUDIT_PREVIOUS_PAGE")}
          onClick={() => props.table.previousPage()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={!props.table.getCanNextPage()}
          aria-label={t("AUDIT_NEXT_PAGE")}
          onClick={() => props.table.nextPage()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
