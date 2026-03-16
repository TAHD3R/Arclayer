"use client";

import { cn } from "@arclayer/lib/utils";

export function DataTableScrollOverflowGradient(props: {
  enabled: boolean;
  visible: boolean;
  rightOffset: number;
}) {
  if (!props.enabled) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 z-25 w-10 transition-opacity duration-200",
        props.visible ? "opacity-100" : "opacity-0",
      )}
      style={{
        right: props.rightOffset,
        background: "linear-gradient(to right, transparent, hsl(var(--background) / 0.6))",
      }}
    />
  );
}
