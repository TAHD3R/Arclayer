"use client";

import { LoaderOne } from "@arclayer/ui/loader";

export function DataTableRefreshOverlay(props: { active: boolean }) {
  if (!props.active) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
    >
      <div className="drop-shadow-xl">
        <LoaderOne />
      </div>
    </div>
  );
}
