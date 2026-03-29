import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type DataPaginationControlsProps = {
  page: number;
  size: number;
  total: number;
  onChange: (nextPage: number, nextSize: number) => void;
  pageSizeOptions?: number[];
  t: TranslateFn;
};

type PageItem = number | "ellipsis";

function resolvePageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: PageItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push("ellipsis");
  for (let next = start; next <= end; next += 1) {
    items.push(next);
  }
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);

  return items;
}

export function DataPaginationControls({
  page,
  size,
  total,
  onChange,
  pageSizeOptions = [10, 20, 50, 100],
  t,
}: DataPaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, size)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = resolvePageItems(safePage, totalPages);
  const resultLabel = t("common:DATA_TABLE_SHOWING_RESULTS", {
    total,
    start: total > 0 ? (safePage - 1) * size + 1 : 0,
    end: total > 0 ? Math.min(safePage * size, total) : 0,
  });

  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
      <div className="min-w-0 text-footnote text-label-secondary">
        <span className="truncate">{resultLabel}</span>
      </div>

      <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("common:PREVIOUS")}
          disabled={safePage <= 1}
          onClick={() => onChange(safePage - 1, size)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pageItems.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-footnote text-label-secondary">
              ...
            </span>
          ) : (
            <Button
              key={item}
              variant="ghost"
              size="sm"
              aria-current={item === safePage ? "page" : undefined}
              aria-label={String(item)}
              className={item === safePage ? "text-primary" : "text-label-secondary"}
              onClick={() => onChange(item, size)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("common:NEXT")}
          disabled={safePage >= totalPages}
          onClick={() => onChange(safePage + 1, size)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </nav>

      <div className="flex items-center justify-end gap-2">
        <span className="text-footnote text-label-secondary">{t("common:ITEMS_PER_PAGE")}</span>
        <Select
          value={String(size)}
          onValueChange={(value) => {
            const nextSize = Number(value) || size;
            const nextTotalPages = Math.max(1, Math.ceil(total / Math.max(1, nextSize)));
            onChange(Math.min(safePage, nextTotalPages), nextSize);
          }}
        >
          <SelectTrigger size="sm" className="w-[4.75rem] justify-between border-transparent px-2 ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
