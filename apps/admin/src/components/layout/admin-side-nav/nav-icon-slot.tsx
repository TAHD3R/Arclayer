import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@arclayer/lib/utils";

export function iconSlot(
  depth: number,
  Icon: AdminNavItem["icon"] | undefined,
  opts?: { isActive?: boolean; collapseMotion?: "shift" | "none" },
) {
  const collapseMotionClassName =
    opts?.collapseMotion === "shift"
      ? "transition-colors duration-320 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
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
