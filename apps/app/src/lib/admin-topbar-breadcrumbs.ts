import { findActiveTrailNodes } from "@/lib/admin-nav-utils";
import type { AdminNavItem } from "@/types/admin-nav";

export type AdminTopbarBreadcrumbMenuItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  disabled?: boolean;
  isCurrent?: boolean;
  icon?: AdminNavItem["icon"];
};

export type AdminTopbarBreadcrumbItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  disabled?: boolean;
  isCurrent?: boolean;
  icon?: AdminNavItem["icon"];
  menuItems?: AdminTopbarBreadcrumbMenuItem[];
};

type NavSection = {
  key: string;
  label: string;
  labelKey?: string;
  items: AdminNavItem[];
};

function sectionKey(item: AdminNavItem): string {
  return item.groupLabelBeforeKey ?? item.groupLabelBefore ?? item.key;
}

function collectTopLevelSections(items: readonly AdminNavItem[]): NavSection[] {
  const sections: NavSection[] = [];
  let current: NavSection | null = null;

  for (const item of items) {
    if (item.groupLabelBeforeKey || item.groupLabelBefore) {
      current = {
        key: `section:${sectionKey(item)}`,
        label: item.groupLabelBefore ?? item.groupLabelBeforeKey ?? item.label,
        labelKey: item.groupLabelBeforeKey,
        items: [],
      };
      sections.push(current);
    }

    current?.items.push(item);
  }

  return sections;
}

function toMenuItem(
  item: AdminNavItem,
  activeTrail: readonly AdminNavItem[],
): AdminTopbarBreadcrumbMenuItem {
  return {
    key: item.key,
    label: item.label,
    labelKey: item.labelKey,
    to: item.to,
    disabled: item.disabled,
    isCurrent: activeTrail.some((activeItem) => activeItem.key === item.key),
    icon: item.icon,
  };
}

function firstNavigableDescendant(item: AdminNavItem): AdminNavItem | null {
  if (item.to && !item.disabled) return item;

  for (const child of item.children ?? []) {
    const found = firstNavigableDescendant(child);
    if (found) return found;
  }

  return null;
}

export function buildAdminTopbarBreadcrumbs(
  navItems: readonly AdminNavItem[],
  pathname: string,
): AdminTopbarBreadcrumbItem[] {
  const activeTrail = findActiveTrailNodes([...navItems], pathname);
  if (activeTrail.length === 0) return [];

  const topLevelActiveItem = activeTrail[0];
  const topLevelSections = collectTopLevelSections(navItems);
  const activeSection = topLevelSections.find((section) =>
    section.items.some((item) => item.key === topLevelActiveItem.key),
  );
  const breadcrumbs: AdminTopbarBreadcrumbItem[] = [];

  if (activeSection) {
    breadcrumbs.push({
      key: activeSection.key,
      label: activeSection.label,
      labelKey: activeSection.labelKey,
      isCurrent: false,
      menuItems: activeSection.items.map((item) => toMenuItem(item, activeTrail)),
    });
  }

  for (const item of activeTrail) {
    const descendantMenuItems = item.children?.map((child) => toMenuItem(child, activeTrail));
    const targetItem = item.to ? item : firstNavigableDescendant(item);

    breadcrumbs.push({
      key: item.key,
      label: item.label,
      labelKey: item.labelKey,
      to: targetItem?.to,
      disabled: item.disabled,
      isCurrent: item.key === activeTrail[activeTrail.length - 1]?.key,
      icon: item.icon,
      ...(descendantMenuItems?.length ? { menuItems: descendantMenuItems } : {}),
    });
  }

  return breadcrumbs;
}
