import "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // Centralize project conventions for column metadata.
  // - title: used by table tooling (e.g. column visibility menu) as a human-friendly label.
  // - sortKey: backend ordering field (usually snake_case) used to build `ordering`.
  // - headerAlign: default header alignment strategy in shared table presenter.
  // - kind: semantic hint for shared table presenter (alignment/behavior defaults).
  // - defaultHidden: whether column is hidden by default (when no persisted state exists).
  interface ColumnMeta<TData extends RowData, TValue> {
    title?: string;
    sortKey?: string;
    headerAlign?: "left" | "center" | "right";
    kind?: "default" | "primary" | "meta" | "status" | "time" | "select" | "actions";
    pin?: "left" | "right" | false;
    defaultHidden?: boolean;
  }
}
