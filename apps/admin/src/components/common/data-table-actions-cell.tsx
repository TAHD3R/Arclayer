import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";
import type { ColumnMeta, RowData } from "@tanstack/react-table";

export type DataTableActionsAlign = "center" | "right";

export function buildDataTableActionsColumnMeta(
  align: DataTableActionsAlign = "right",
): ColumnMeta<RowData, unknown> {
  return {
    title: "",
    kind: "actions",
    headerAlign: align,
  };
}

export function DataTableActionsCell(props: {
  align?: DataTableActionsAlign;
  className?: string;
  children: ReactNode;
}) {
  const justifyClass = props.align === "center" ? "justify-center" : "justify-end";

  return (
    <div className={cn("flex w-full items-center", justifyClass, props.className)}>
      {props.children}
    </div>
  );
}
