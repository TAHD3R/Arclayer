"use client";

import { cn } from "@arclayer/lib/utils";
import { DotMatrix, type DotMatrixState } from "../dot-matrix";
import { mono } from "./surfaces";

export function ThinkingIndicator({
  label,
  elapsed,
  state = "thinking",
  className,
}: {
  label: string;
  elapsed?: string;
  state?: DotMatrixState;
  className?: string;
}) {
  return (
    <div className={cn("text-foreground/55 flex items-center gap-2.5 text-sm", className)}>
      <DotMatrix state={state} label={label} />
      <span
        key={label}
        className="fade-in slide-in-from-bottom-1 animate-in relative inline-block leading-none duration-300"
      >
        <span>{label}</span>
        <span
          aria-hidden
          className="shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
        >
          {label}
        </span>
      </span>
      {elapsed !== undefined ? (
        <span className={cn(mono, "text-foreground/30 tabular-nums")}>{elapsed}</span>
      ) : null}
    </div>
  );
}
