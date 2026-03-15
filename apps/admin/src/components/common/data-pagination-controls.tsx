import { Button } from "@celestial/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@celestial/ui/select";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type DataPaginationControlsProps = {
  page: number;
  size: number;
  total: number;
  onChange: (nextPage: number, nextSize: number) => void;
  pageSizeOptions?: number[];
  t: TranslateFn;
};

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

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-2">
        <span className="text-footnote text-label-secondary">{t("common:PAGE_SIZE")}</span>
        <Select
          value={String(size)}
          onValueChange={(value) => {
            const nextSize = Number(value) || size;
            const nextTotalPages = Math.max(1, Math.ceil(total / Math.max(1, nextSize)));
            onChange(Math.min(safePage, nextTotalPages), nextSize);
          }}
        >
          <SelectTrigger className="w-20">
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

      <div className="text-footnote text-label-secondary">
        {safePage}/{totalPages}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={safePage <= 1}
        onClick={() => onChange(safePage - 1, size)}
      >
        {t("common:PREVIOUS")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={safePage >= totalPages}
        onClick={() => onChange(safePage + 1, size)}
      >
        {t("common:NEXT")}
      </Button>
    </div>
  );
}
