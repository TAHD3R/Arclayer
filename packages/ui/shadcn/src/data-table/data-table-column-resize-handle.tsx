"use client";

import type { Header } from "@tanstack/react-table";

import { cn } from "@arclayer/lib/utils";

export function DataTableColumnResizeHandle<TData>(props: { header: Header<TData, unknown> }) {
  if (!props.header.column.getCanResize()) return null;

  return (
    <button
      type="button"
      aria-label={`Resize ${props.header.column.id} column`}
      className={cn(
        "absolute right-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none select-none",
        "after:absolute after:right-1/2 after:top-2 after:h-[calc(100%-1rem)] after:w-px after:bg-border/60 after:opacity-0 after:transition-[opacity,background-color]",
        "group-hover/header-cell:after:opacity-100 hover:after:bg-foreground/40 focus-visible:outline-none focus-visible:after:opacity-100 focus-visible:after:bg-ring",
        props.header.column.getIsResizing() ? "after:bg-primary after:opacity-100" : "",
      )}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        props.header.column.resetSize();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        props.header.getResizeHandler()(event);
      }}
      onTouchStart={(event) => {
        event.stopPropagation();
        props.header.getResizeHandler()(event);
      }}
    />
  );
}
