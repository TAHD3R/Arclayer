"use client";

import { Spinner } from "@arclayer/ui/spinner";

export function DataTableRefreshOverlay(props: { active: boolean; label: string }) {
  if (!props.active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={props.label}
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center rounded-[inherit] bg-background/55 backdrop-blur-sm"
    >
      <div className="inline-flex items-center gap-2.5 rounded-full px-4 py-2">
        <Spinner aria-hidden="true" className="size-4 text-label-secondary" />
        <span className="text-footnote font-medium text-label-primary">{props.label}</span>
      </div>
    </div>
  );
}
