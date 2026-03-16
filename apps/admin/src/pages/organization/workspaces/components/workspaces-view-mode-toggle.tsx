import { LayoutGrid, List } from "@arclayer/ui/icons/lucide-animated";

import { Button } from "@arclayer/ui/button";
import { ButtonGroup } from "@arclayer/ui/button-group";
import type { OrganizationWorkspacesTranslateFn, OrganizationWorkspacesViewMode } from "../types";

export type WorkspacesViewModeToggleProps = {
  t: OrganizationWorkspacesTranslateFn;
  value: OrganizationWorkspacesViewMode;
  onChange: (next: OrganizationWorkspacesViewMode) => void;
};

export function WorkspacesViewModeToggle({ t, value, onChange }: WorkspacesViewModeToggleProps) {
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
