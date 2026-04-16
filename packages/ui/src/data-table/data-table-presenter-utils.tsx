"use client";

import type { Cell, Header } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "@arclayer/lib/utils";

type AlignClass = "text-left" | "text-center" | "text-right";
type ColumnKind = "default" | "primary" | "meta" | "status" | "time" | "select" | "actions";

type PinStyleState = {
  className: string | undefined;
  style: CSSProperties;
};

const DEFAULT_COLUMN_SIZE_PX = 150;

export function resolveColumnKind(
  meta: { kind?: string } | undefined,
  columnId: string,
): ColumnKind {
  if (meta?.kind === "primary") return "primary";
  if (meta?.kind === "meta") return "meta";
  if (meta?.kind === "status") return "status";
  if (meta?.kind === "time") return "time";
  if (meta?.kind === "select" || columnId === "select") return "select";
  if (meta?.kind === "actions" || columnId === "actions" || columnId === "action") {
    return "actions";
  }
  return "default";
}

export function resolveHeaderAlignClass<TData>(header: Header<TData, unknown>): AlignClass {
  const meta = header.column.columnDef.meta;
  if (meta?.headerAlign === "left") return "text-left";
  if (meta?.headerAlign === "right") return "text-right";
  if (meta?.headerAlign === "center") return "text-center";

  const kind = resolveColumnKind(meta, header.column.id);
  if (kind === "actions") return "text-right";
  if (kind === "select" || kind === "status") return "text-center";

  return "text-left";
}

export function resolveHeaderJustifyClass(align: AlignClass): string {
  if (align === "text-left") return "justify-start";
  if (align === "text-right") return "justify-end";
  return "justify-center";
}

export function SortStateIcon(props: { state: false | "asc" | "desc" }) {
  if (props.state === "asc") return <ArrowUp className="size-3.5 text-label-primary" />;
  if (props.state === "desc") return <ArrowDown className="size-3.5 text-label-primary" />;
  return (
    <ArrowUpDown className="size-3.5 text-label-secondary/40 transition-colors group-hover:text-label-primary/80" />
  );
}

export function resolveHeaderPaddingClass(
  meta: { kind?: string } | undefined,
  columnId: string,
): string {
  const kind = resolveColumnKind(meta, columnId);
  if (kind === "select") return "px-0";
  if (kind === "actions") return "px-2";
  if (kind === "primary") return "px-5";
  if (kind === "time") return "px-4";
  return "px-4";
}

export function resolveCellPaddingXClass(
  meta: { kind?: string } | undefined,
  columnId: string,
): string {
  const kind = resolveColumnKind(meta, columnId);
  if (kind === "select") return "px-0";
  if (kind === "actions") return "px-2";
  if (kind === "primary") return "px-5";
  if (kind === "status") return "px-3";
  if (kind === "time") return "px-4";
  return "px-4";
}

function resolveColumnBaseStyle<TData>(
  column: Header<TData, unknown>["column"],
  pinned?: "left" | "right" | false,
): CSSProperties {
  const size = column.getSize();
  if (!size) return {};
  const hasExplicitSizing =
    column.columnDef.size != null ||
    column.columnDef.minSize != null ||
    column.columnDef.maxSize != null ||
    size !== DEFAULT_COLUMN_SIZE_PX;

  if (pinned && hasExplicitSizing) {
    return {
      width: size,
      minWidth: size,
      maxWidth: size,
    };
  }
  if (pinned) return { minWidth: size };
  if (!hasExplicitSizing) return { minWidth: size };

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
    className: cn("z-30 bg-background"),
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
    className: cn("z-20 bg-inherit transition-colors"),
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
