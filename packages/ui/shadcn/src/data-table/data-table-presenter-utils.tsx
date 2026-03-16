"use client";

import type { Cell, Header } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "@arclayer/lib/utils";

type AlignClass = "text-left" | "text-center" | "text-right";

type PinStyleState = {
  className: string | undefined;
  style: CSSProperties;
};

export function resolveHeaderAlignClass<TData>(header: Header<TData, unknown>): AlignClass {
  const meta = header.column.columnDef.meta;
  if (meta?.headerAlign === "left") return "text-left";
  if (meta?.headerAlign === "right") return "text-right";
  if (meta?.headerAlign === "center") return "text-center";

  if (meta?.kind === "actions" || header.column.id === "actions") return "text-right";
  if (meta?.kind === "select" || header.column.id === "select") return "text-center";

  return "text-left";
}

export function resolveHeaderJustifyClass(align: AlignClass): string {
  if (align === "text-left") return "justify-start";
  if (align === "text-right") return "justify-end";
  return "justify-center";
}

export function SortStateIcon(props: { state: false | "asc" | "desc" }) {
  if (props.state === "asc") return <ArrowUp className="size-3.5 text-foreground" />;
  if (props.state === "desc") return <ArrowDown className="size-3.5 text-foreground" />;
  return (
    <ArrowUpDown className="size-3.5 text-label-secondary/40 transition-colors group-hover:text-foreground/80" />
  );
}

function resolveColumnBaseStyle<TData>(
  column: Header<TData, unknown>["column"],
  pinned?: "left" | "right" | false,
): CSSProperties {
  const size = column.getSize();
  if (!size) return {};

  // Pinned columns use minWidth only — let content determine actual width
  // so buttons/icons in actions columns are never clipped.
  if (pinned) return { minWidth: size };

  return {
    width: size,
    minWidth: size,
    maxWidth: size,
  };
}

export function resolveHeaderPinStyle<TData>(header: Header<TData, unknown>): PinStyleState {
  const pinned = header.column.getIsPinned();
  const style: CSSProperties = resolveColumnBaseStyle(header.column, pinned);

  if (!pinned) return { className: undefined, style };

  if (pinned === "left") {
    style.position = "sticky";
    style.left = `${header.column.getStart("left")}px`;
  } else {
    style.position = "sticky";
    style.right = `${header.column.getAfter("right")}px`;
  }

  return {
    className: cn(
      "z-30 bg-background",
      pinned === "left" && header.column.getIsLastColumn("left")
        ? "shadow-[8px_0_16px_-4px_rgba(0,0,0,0.05),_1px_0_0_0_hsl(var(--border)/0.3)]"
        : "",
      pinned === "right" && header.column.getIsFirstColumn("right")
        ? "shadow-[-8px_0_16px_-4px_rgba(0,0,0,0.05),_-1px_0_0_0_hsl(var(--border)/0.3)]"
        : "",
    ),
    style,
  };
}

export function resolveCellPinStyle<TData>(cell: Cell<TData, unknown>): PinStyleState {
  const pinned = cell.column.getIsPinned();
  const style: CSSProperties = resolveColumnBaseStyle(cell.column, pinned);

  if (!pinned) return { className: undefined, style };

  if (pinned === "left") {
    style.position = "sticky";
    style.left = `${cell.column.getStart("left")}px`;
  } else {
    style.position = "sticky";
    style.right = `${cell.column.getAfter("right")}px`;
  }

  return {
    className: cn(
      "z-20 bg-background group-hover/row:bg-muted/60 transition-colors",
      pinned === "left" && cell.column.getIsLastColumn("left")
        ? "shadow-[8px_0_16px_-4px_rgba(0,0,0,0.05),_1px_0_0_0_hsl(var(--border)/0.3)]"
        : "",
      pinned === "right" && cell.column.getIsFirstColumn("right")
        ? "shadow-[-8px_0_16px_-4px_rgba(0,0,0,0.05),_-1px_0_0_0_hsl(var(--border)/0.3)]"
        : "",
    ),
    style,
  };
}

export function shouldIgnoreRowClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, [role=button], [role=menuitem], [role=checkbox], [data-row-click-ignore=true]",
    ),
  );
}
