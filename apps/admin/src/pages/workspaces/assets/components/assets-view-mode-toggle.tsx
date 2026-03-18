import { LayoutGrid, List } from "@arclayer/ui/icons/lucide-animated";

import { Button } from "@arclayer/ui/button";
import { ButtonGroup } from "@arclayer/ui/button-group";

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
    <ButtonGroup>
      <Button
        variant={value === "card" ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => onChange("card")}
        aria-pressed={value === "card"}
        aria-label={cardLabel}
      >
        <LayoutGrid className="size-4" aria-hidden="true" />
      </Button>
      <Button
        variant={value === "table" ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => onChange("table")}
        aria-pressed={value === "table"}
        aria-label={tableLabel}
      >
        <List className="size-4" aria-hidden="true" />
      </Button>
    </ButtonGroup>
  );
}
