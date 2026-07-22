import { SidebarGroupLabel } from "@arclayer/ui/sidebar";

import { cn } from "@arclayer/lib/utils";
import type { AdminNavItem } from "@/types/admin-nav";

export function resolveLeadingLabel(item: AdminNavItem, t: (key: string) => string): string | null {
  if (item.groupLabelBeforeKey) return t(item.groupLabelBeforeKey);
  return item.groupLabelBefore ?? null;
}

export function NavGroupMarker(props: { label: string }) {
  return (
    <li
      data-slot="admin-side-nav-group-marker"
      className={cn(
        "relative overflow-hidden py-2",
        "transition-[padding] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        "group-data-[state=expanded]:px-2",
        "group-data-[state=expanded]:pt-3",
        "group-data-[state=expanded]:pb-2.5",
      )}
      aria-hidden="true"
    >
      <div
        data-slot="admin-side-nav-group-marker-divider"
        className={cn(
          "border-b border-sidebar-border origin-left transform-gpu",
          "transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
          "group-data-[state=expanded]:absolute group-data-[state=expanded]:inset-x-3 group-data-[state=expanded]:top-1/2",
          "group-data-[state=expanded]:scale-x-95 group-data-[state=expanded]:opacity-0",
        )}
      />
      <SidebarGroupLabel
        data-slot="admin-side-nav-group-label"
        className={cn(
          "pointer-events-none absolute inset-x-3 top-1.5 h-auto select-none rounded-none px-0 py-0 text-footnote! font-semibold text-label-tertiary truncate",
          "origin-left transform-gpu transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
          "-translate-y-1 opacity-0",
          "group-data-[state=expanded]:relative group-data-[state=expanded]:inset-auto group-data-[state=expanded]:top-auto",
          "group-data-[state=expanded]:translate-y-0 group-data-[state=expanded]:opacity-100",
        )}
      >
        {props.label}
      </SidebarGroupLabel>
    </li>
  );
}

export function NavDivider() {
  return (
    <li data-slot="admin-side-nav-divider" className="py-2" aria-hidden="true">
      <div className="border-b border-sidebar-border" />
    </li>
  );
}
