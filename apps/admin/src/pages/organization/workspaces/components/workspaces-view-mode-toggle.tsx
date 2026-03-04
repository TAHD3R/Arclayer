import { Segmented, type SegmentedProps } from "antd";
import { LayoutGrid, List } from "lucide-react";

import type { OrganizationWorkspacesTranslateFn, OrganizationWorkspacesViewMode } from "../types";

export type WorkspacesViewModeToggleDisplay = "icon" | "icon+text";

export type WorkspacesViewModeToggleProps = {
  t: OrganizationWorkspacesTranslateFn;
  value: OrganizationWorkspacesViewMode;
  onChange: (next: OrganizationWorkspacesViewMode) => void;
  display?: WorkspacesViewModeToggleDisplay;
};

export function WorkspacesViewModeToggle({
  t,
  value,
  onChange,
  display = "icon",
}: WorkspacesViewModeToggleProps) {
  const cardLabel = t("common:VIEW_MODE_CARD");
  const tableLabel = t("common:VIEW_MODE_TABLE");
  const showText = display === "icon+text";
  const styles: SegmentedProps["styles"] = {
    root: {
      padding: 4,
      width: 260,
    },
  };
  const options: SegmentedProps<OrganizationWorkspacesViewMode>["options"] = [
    {
      label: (
        <span className="inline-flex items-center gap-1.5">
          <LayoutGrid className="size-4" aria-hidden="true" />
          {showText ? <span>{cardLabel}</span> : null}
        </span>
      ),
      value: "card",
    },
    {
      label: (
        <span className="inline-flex items-center gap-1.5">
          <List className="size-4" aria-hidden="true" />
          {showText ? <span>{tableLabel}</span> : null}
        </span>
      ),
      value: "table",
    },
  ];

  return (
    <Segmented
      styles={styles}
      options={options}
      value={value}
      onChange={(next) => {
        const v = String(next);
        onChange(v === "table" ? "table" : "card");
      }}
    />
  );
}
