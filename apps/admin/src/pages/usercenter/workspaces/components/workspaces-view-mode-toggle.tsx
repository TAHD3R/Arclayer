import { LayoutGrid, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";
import type { UserCenterWorkspacesTranslateFn, UserCenterWorkspacesViewMode } from "../types";

export type WorkspacesViewModeToggleProps = {
  t: UserCenterWorkspacesTranslateFn;
  value: UserCenterWorkspacesViewMode;
  onChange: (next: UserCenterWorkspacesViewMode) => void;
};

export function WorkspacesViewModeToggle({ t, value, onChange }: WorkspacesViewModeToggleProps) {
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
