"use client";

import { cn } from "@celestial/lib/utils";

import type { DataTableDensity } from "./types";

export function DataTableDensityDiagram(props: { density: DataTableDensity }) {
  const rowClass =
    props.density === "compact" ? "h-8" : props.density === "relaxed" ? "h-12" : "h-10";

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/15 px-3 py-2">
        <div className="h-2 w-10 rounded bg-muted/70" />
        <div className="h-2 w-14 rounded bg-muted/55" />
        <div className="ml-auto h-2 w-8 rounded bg-muted/45" />
      </div>

      <div className="divide-y divide-border/50">
        {Array.from({ length: 4 }).map((_, idx) => (
          // eslint-disable-next-line react/no-array-index-key
          <div
            key={idx}
            className={cn(
              "grid grid-cols-[24px_1fr_88px] items-center px-3",
              rowClass,
              idx === 1 ? "bg-accent/25" : idx % 2 === 0 ? "bg-muted/10" : "bg-background",
            )}
          >
            <div className="flex items-center justify-center">
              <div className="size-2.5 rounded-full bg-muted/60" />
            </div>
            <div className="min-w-0 pr-3">
              <div className="h-2.5 w-[68%] rounded bg-muted/55" />
              <div className="mt-1 h-2 w-[52%] rounded bg-muted/35" />
            </div>
            <div className="flex justify-end">
              <div className="h-2.5 w-12 rounded bg-muted/45" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DataTableDensityOptionButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  density: DataTableDensity;
}) {
  const barHeightClass =
    props.density === "compact" ? "h-2.5" : props.density === "relaxed" ? "h-4" : "h-3.5";

  return (
    <button
      type="button"
      className={cn(
        "group w-full rounded-xl border px-3 py-2 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        props.active ? "border-ring bg-accent/35" : "border-border hover:bg-accent/25",
      )}
      onClick={props.onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-footnote font-medium">{props.label}</div>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-2.5 rounded bg-muted/60", barHeightClass)} />
          <div className={cn("w-2.5 rounded bg-muted/45", barHeightClass)} />
          <div className={cn("w-2.5 rounded bg-muted/35", barHeightClass)} />
        </div>
      </div>
    </button>
  );
}
