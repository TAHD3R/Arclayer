import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@arclayer/lib/utils";

export function iconSlot(
  depth: number,
  Icon: AdminNavItem["icon"] | undefined,
  opts?: { isActive?: boolean; collapseMotion?: "shift" | "none" },
) {
  const collapseMotionClassName =
    opts?.collapseMotion === "shift"
      ? cn(
          "transition-transform duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
          // When the sidebar collapses, menu buttons become `size-10` with no padding.
          // Shift the icon slot so the icon lands centered without relying on `justify-center` (not animatable).
          "group-data-[collapsible=icon]:translate-x-2.5",
        )
      : null;

  if (depth === 0 && Icon) {
    return (
      <span
        className={cn(
          "size-5 shrink-0 inline-flex items-center justify-center",
          collapseMotionClassName,
          opts?.isActive ? "text-primary" : null,
        )}
        aria-hidden="true"
      >
        <Icon className="size-full" />
      </span>
    );
  }
  return <span className={cn("size-5 shrink-0", collapseMotionClassName)} aria-hidden="true" />;
}
