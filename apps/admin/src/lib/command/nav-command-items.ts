import type { AdminNavItem } from "@/types/admin-nav";
import type { CommandEntry } from "@/lib/command/command-types";

export function buildAdminNavCommandEntries(
  navItems: readonly AdminNavItem[],
  t: (key: string) => string,
): CommandEntry[] {
  const result: CommandEntry[] = [];
  const seenRoutes = new Set<string>();

  const walk = (items: readonly AdminNavItem[]) => {
    for (const item of items) {
      if (item.to && !item.disabled && !seenRoutes.has(item.to)) {
        const title = item.labelKey ? t(item.labelKey) : item.label;
        const to = item.to;

        seenRoutes.add(to);
        result.push({
          id: `page:${to}`,
          key: `page:${to}`,
          kind: "page",
          title,
          subtitle: to,
          keywords: [title, to, item.key],
          icon: item.icon,
          action: {
            type: "navigate",
            to,
          },
          recent: {
            enabled: true,
            snapshot: {
              key: `page:${to}`,
              kind: "page",
              title,
              subtitle: to,
              keywords: [title, to, item.key],
              to,
            },
          },
        });
      }

      if (item.children?.length) walk(item.children);
    }
  };

  walk(navItems);
  return result;
}
