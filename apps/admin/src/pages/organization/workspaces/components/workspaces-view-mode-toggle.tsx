import { Button, Space } from "antd";
import { LayoutGrid, List } from "lucide-react";

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
    <Space.Compact>
      <Button
        type="text"
        className={value === "card" ? "bg-fill-quaternary" : undefined}
        icon={<LayoutGrid className="size-4" aria-hidden="true" />}
        onClick={() => onChange("card")}
        aria-pressed={value === "card"}
        aria-label={cardLabel}
        autoInsertSpace={false}
      />
      <Button
        type="text"
        className={value === "table" ? "bg-fill-quaternary" : undefined}
        icon={<List className="size-4" aria-hidden="true" />}
        onClick={() => onChange("table")}
        aria-pressed={value === "table"}
        aria-label={tableLabel}
        autoInsertSpace={false}
      />
    </Space.Compact>
  );
}
