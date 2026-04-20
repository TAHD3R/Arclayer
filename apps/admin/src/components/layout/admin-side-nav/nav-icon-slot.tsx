import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@arclayer/lib/utils";

export function iconSlot(
  depth: number,
  Icon: AdminNavItem["icon"] | undefined,
  opts?: { isActive?: boolean; collapseMotion?: "shift" | "none" },
) {
  const collapseMotionClassName =
    opts?.collapseMotion === "shift"
      ? "transform-gpu transition-[color,transform] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
      : null;

  if (depth === 0 && Icon) {
    return (
      <span
        className={cn(
          "size-5 shrink-0 inline-flex items-center justify-center",
          collapseMotionClassName,
          opts?.collapseMotion === "shift" ? "group-data-[collapsible=icon]:translate-x-0" : null,
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
