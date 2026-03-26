import { LayoutGrid, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";

export type AssetsViewMode = "card" | "table";

export type AssetsViewModeToggleProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  value: AssetsViewMode;
  onChange: (next: AssetsViewMode) => void;
};

export function AssetsViewModeToggle({ t, value, onChange }: AssetsViewModeToggleProps) {
  const cardLabel = t("common:VIEW_MODE_CARD");
  const tableLabel = t("common:VIEW_MODE_TABLE");

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      aria-label={`${cardLabel}, ${tableLabel}`}
      onValueChange={(next) => {
        if (next !== "card" && next !== "table") return;
        onChange(next);
      }}
    >
      <ToggleGroupItem value="card" aria-label={cardLabel} className="min-w-0 px-2.5">
        <LayoutGrid className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="table" aria-label={tableLabel} className="min-w-0 px-2.5">
        <List className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
