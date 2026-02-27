import type { InstalledPluginItem } from "./types";

export function normalizeStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function statusColor(status: string): string | undefined {
  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === "started") return "green";
  if (normalizedStatus === "installed") return "blue";
  if (normalizedStatus === "disabled") return undefined;
  if (normalizedStatus === "failed") return "red";
  return undefined;
}

export function getPluginRef(plugin: InstalledPluginItem): string {
  return String(plugin.slug || plugin.pluginId);
}

export function buildCategoryTabs(
  items: InstalledPluginItem[],
  t: (key: string) => string,
): { key: string; label: string }[] {
  const defs = [
    { key: "content_creation", label: t("PLUGIN_CATEGORY_CONTENT_CREATION") },
    { key: "media_management", label: t("PLUGIN_CATEGORY_MEDIA_MANAGEMENT") },
    { key: "seo_marketing", label: t("PLUGIN_CATEGORY_SEO_MARKETING") },
    { key: "system_security", label: t("PLUGIN_CATEGORY_SYSTEM_SECURITY") },
    { key: "performance_optimization", label: t("PLUGIN_CATEGORY_PERFORMANCE_OPTIMIZATION") },
    { key: "user_interaction", label: t("PLUGIN_CATEGORY_USER_INTERACTION") },
    { key: "data_integration", label: t("PLUGIN_CATEGORY_DATA_INTEGRATION") },
    { key: "data_analytics", label: t("PLUGIN_CATEGORY_DATA_ANALYTICS") },
  ];

  const counts = new Map<string, number>();
  for (const item of items) {
    const category = String(item.category || "")
      .trim()
      .toLowerCase();
    if (!category) continue;
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  const tabs: { key: string; label: string }[] = [{ key: "all", label: t("PLUGIN_CATEGORY_ALL") }];
  for (const def of defs) {
    if ((counts.get(def.key) || 0) > 0) tabs.push(def);
  }
  return tabs;
}
