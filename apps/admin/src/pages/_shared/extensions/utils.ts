import type { InstalledExtensionItem } from "./types";

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

export function getExtensionRef(extension: InstalledExtensionItem): string {
  return String(extension.slug || extension.pluginId);
}

export function buildCategoryTabs(
  _items: InstalledExtensionItem[],
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

  return [{ key: "all", label: t("PLUGIN_CATEGORY_ALL") }, ...defs];
}
