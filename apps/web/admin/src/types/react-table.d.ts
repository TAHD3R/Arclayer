import "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // Centralize project conventions for column metadata.
  // - title: used by table tooling (e.g. column visibility menu) as a human-friendly label.
  // - sortKey: backend ordering field (usually snake_case) used to build `ordering`.
  interface ColumnMeta<TData extends RowData, TValue> {
    title?: string;
    sortKey?: string;
  }
}
