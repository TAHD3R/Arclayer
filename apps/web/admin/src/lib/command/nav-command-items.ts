import type { AdminNavItem } from "@/types/admin-nav";

export type AdminCommandItem = {
  id: string;
  to: string;
  title: string;
  description: string;
  icon: AdminNavItem["icon"];
  keywords: string[];
  onSelect: () => void;
};

export function buildAdminNavCommandItems(
  navItems: readonly AdminNavItem[],
  t: (key: string) => string,
  onNavigate: (to: string) => void,
): AdminCommandItem[] {
  const result: AdminCommandItem[] = [];
  const seenRoutes = new Set<string>();

  const walk = (items: readonly AdminNavItem[]) => {
    for (const item of items) {
      if (item.to && !item.disabled && !seenRoutes.has(item.to)) {
        const title = item.labelKey ? t(item.labelKey) : item.label;
        const to = item.to;

        seenRoutes.add(to);
        result.push({
          id: `route:${to}`,
          to,
          title,
          description: to,
          icon: item.icon,
          keywords: [title, to],
          onSelect: () => onNavigate(to),
        });
      }

      if (item.children?.length) walk(item.children);
    }
  };

  walk(navItems);
  return result;
}
