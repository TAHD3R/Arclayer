"use client";

import { SpinnerOverlay } from "@arclayer/ui/spinner";

export function DataTableRefreshOverlay(props: { active: boolean }) {
  if (!props.active) return null;

  return (
    <SpinnerOverlay
      spinnerContainerClassName="p-2.5 shadow-md shadow-black/10"
      spinnerClassName="size-4"
    />
  );
}
