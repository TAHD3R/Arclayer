import { LayoutGrid, List } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";

import type { UserCenterProjectsTranslateFn, UserCenterProjectsViewMode } from "../types";

export type ProjectsViewModeToggleProps = {
  t: UserCenterProjectsTranslateFn;
  value: UserCenterProjectsViewMode;
  onChange: (next: UserCenterProjectsViewMode) => void;
};

export function ProjectsViewModeToggle({ t, value, onChange }: ProjectsViewModeToggleProps) {
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
