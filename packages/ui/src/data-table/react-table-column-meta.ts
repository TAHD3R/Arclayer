import "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    title?: string;
    sortKey?: string;
    headerAlign?: "left" | "center" | "right";
    kind?: "default" | "primary" | "meta" | "status" | "time" | "select" | "actions";
    pin?: "left" | "right" | false;
    defaultHidden?: boolean;
  }
}
