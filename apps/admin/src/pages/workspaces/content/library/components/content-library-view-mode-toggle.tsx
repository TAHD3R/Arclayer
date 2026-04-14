import { LayoutGrid, List } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";

export type ContentLibraryViewMode = "card" | "table";

const viewModeToggleItemClassName =
  "min-w-0 px-2.5 data-[state=on]:border-border/80 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground";

export function ContentLibraryViewModeToggle(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  value: ContentLibraryViewMode;
  onChange: (next: ContentLibraryViewMode) => void;
}) {
  const cardLabel = props.t("common:VIEW_MODE_CARD");
  const tableLabel = props.t("common:VIEW_MODE_TABLE");

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={props.value}
      aria-label={`${cardLabel}, ${tableLabel}`}
      onValueChange={(next) => {
        if (next !== "card" && next !== "table") return;
        props.onChange(next);
      }}
    >
      <ToggleGroupItem value="card" aria-label={cardLabel} className={viewModeToggleItemClassName}>
        <LayoutGrid className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="table"
        aria-label={tableLabel}
        className={viewModeToggleItemClassName}
      >
        <List className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
