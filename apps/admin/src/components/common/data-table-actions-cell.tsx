import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";
import type { ColumnMeta, RowData } from "@tanstack/react-table";

export type DataTableActionsAlign = "center" | "right";

export function buildDataTableActionsColumnMeta(
  align: DataTableActionsAlign = "right",
  pin: "left" | "right" | false = "right",
): ColumnMeta<RowData, unknown> {
  return {
    title: "",
    kind: "actions",
    headerAlign: align,
    pin,
  };
}

export function DataTableActionsCell(props: {
  align?: DataTableActionsAlign;
  className?: string;
  children: ReactNode;
}) {
  const alignmentClass = props.align === "center" ? "mx-auto" : "ml-auto";

  return (
    <div
      className={cn(
        "flex min-w-max max-w-full items-center gap-2 whitespace-nowrap px-2 py-1",
        alignmentClass,
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
