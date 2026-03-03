import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@celestial/lib/utils";

export function iconSlot(
  depth: number,
  Icon: AdminNavItem["icon"] | undefined,
  opts?: { isActive?: boolean },
) {
  if (depth === 0 && Icon) {
    return (
      <span
        className={cn(
          "size-5 shrink-0 inline-flex items-center justify-center",
          opts?.isActive ? "text-primary" : null,
        )}
        aria-hidden="true"
      >
        <Icon className="size-full" />
      </span>
    );
  }
  return <span className="size-5 shrink-0" aria-hidden="true" />;
}
