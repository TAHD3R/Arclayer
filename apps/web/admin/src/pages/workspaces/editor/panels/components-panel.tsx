import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Input } from "antd";

import {
  CORE_BLOCK_MANIFESTS,
  resolveLocalizedValue,
  type BlockCategory,
  type ViewerContext,
} from "@celestial/site-block-protocol";

const VIEWER_CTX: ViewerContext = { locale: "zh-CN", fallbackLocale: "en-US" };

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  layout: "Layout",
  text: "Text",
  media: "Media",
  data: "Data",
  navigation: "Navigation",
  interactive: "Interactive",
  custom: "Custom",
};

export function ComponentsPanel() {
  const { t } = useTranslation(["content_pages"]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return CORE_BLOCK_MANIFESTS.filter((m) => {
      const label = resolveLocalizedValue(m.label, VIEWER_CTX) ?? m.type;
      return label.toLowerCase().includes(q) || m.type.toLowerCase().includes(q);
    });
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<BlockCategory, typeof filtered>();
    for (const m of filtered) {
      const list = map.get(m.category) ?? [];
      list.push(m);
      map.set(m.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search */}
      <div className="px-2 py-2">
        <Input
          size="small"
          prefix={<Search className="size-3.5 text-label-secondary" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("content_pages:EDITOR_V2_ELEMENTS_SEARCH", {
            defaultValue: "Search blocks...",
          })}
          allowClear
        />
      </div>

      {/* Block list by category */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {[...grouped.entries()].map(([category, manifests]) => (
          <div key={category} className="mb-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-label-secondary">
              {CATEGORY_LABELS[category]}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {manifests.map((m) => (
                <button
                  key={m.type}
                  type="button"
                  className="flex flex-col items-center gap-1 rounded-md border p-2 text-caption hover:bg-muted"
                >
                  <span className="text-[10px] text-label-secondary">{m.icon ?? m.type}</span>
                  <span className="truncate">
                    {resolveLocalizedValue(m.label, VIEWER_CTX) ?? m.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
