import { useEffect, useMemo, useState } from "react";

import type { InstalledExtensionItem } from "../types";
import { buildCategoryTabs, getExtensionCategory } from "../utils";

function normalizeLower(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function filterByProvider(
  items: InstalledExtensionItem[],
  opts: { officialChecked: boolean; communityChecked: boolean },
): InstalledExtensionItem[] {
  const off = Boolean(opts.officialChecked);
  const comm = Boolean(opts.communityChecked);
  if (off && comm) return items;
  return items.filter((item) => {
    const provider = normalizeLower(item.provider);
    if (provider === "official") return off;
    if (provider === "community") return comm;
    return off || comm;
  });
}

function filterByCategory(
  items: InstalledExtensionItem[],
  category: string,
): InstalledExtensionItem[] {
  const normalized = normalizeLower(category) || "all";
  if (normalized === "all") return items;
  return items.filter((item) => normalizeLower(getExtensionCategory(item)) === normalized);
}

function filterBySearch(items: InstalledExtensionItem[], query: string): InstalledExtensionItem[] {
  const q = normalizeLower(query);
  if (!q) return items;
  return items.filter((item) => {
    const name = normalizeLower(item.name);
    const desc = normalizeLower(item.description);
    return name.includes(q) || desc.includes(q);
  });
}

export function useExtensionsFilters(input: {
  items: InstalledExtensionItem[];
  t: (key: string) => string;
}) {
  const [category, setCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [officialChecked, setOfficialChecked] = useState(true);
  const [communityChecked, setCommunityChecked] = useState(true);

  const categoryTabs = useMemo(
    () => buildCategoryTabs(input.items, (key) => input.t(`plugin:${key}`)),
    [input.items, input.t],
  );

  useEffect(() => {
    // Filtering is local, so the visible list updates in place.
  }, [category, searchQuery, officialChecked, communityChecked]);

  useEffect(() => {
    if (categoryTabs.some((c) => c.key === category)) return;
    setCategory("all");
  }, [category, categoryTabs]);

  const filtered = useMemo(() => {
    const byProvider = filterByProvider(input.items, { officialChecked, communityChecked });
    const byCategory = filterByCategory(byProvider, category);
    return filterBySearch(byCategory, searchQuery);
  }, [input.items, officialChecked, communityChecked, category, searchQuery]);

  const enabledItems = useMemo(() => filtered.filter((p) => Boolean(p.enabled)), [filtered]);

  return {
    categoryTabs,
    category,
    setCategory,
    searchQuery,
    setSearchQuery,
    officialChecked,
    setOfficialChecked,
    communityChecked,
    setCommunityChecked,
    explorePageItems: filtered,
    exploreTotal: filtered.length,
    filtered,
    filteredInstalled: enabledItems,
    installedPageItems: enabledItems,
    installedTotal: enabledItems.length,
  };
}
