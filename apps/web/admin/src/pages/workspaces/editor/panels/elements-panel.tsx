import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";

import {
  CORE_BLOCK_MANIFESTS,
  CORE_BLOCK_PATTERNS,
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

export function ElementsPanel() {
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
      <div className="relative px-2 py-2">
        <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("content_pages:EDITOR_V2_ELEMENTS_SEARCH", {
            defaultValue: "Search blocks...",
          })}
          className="h-8 w-full rounded-md border bg-transparent pl-8 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Block list by category */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {[...grouped.entries()].map(([category, manifests]) => (
          <div key={category} className="mb-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {manifests.map((m) => (
                <button
                  key={m.type}
                  type="button"
                  className="flex flex-col items-center gap-1 rounded-md border p-2 text-xs hover:bg-muted"
                  onClick={() => console.log("insertBlock", m.type)}
                >
                  <span className="text-[10px] text-muted-foreground">{m.icon ?? m.type}</span>
                  <span className="truncate">
                    {resolveLocalizedValue(m.label, VIEWER_CTX) ?? m.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Patterns */}
        {CORE_BLOCK_PATTERNS.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("content_pages:EDITOR_V2_ELEMENTS_PATTERNS", { defaultValue: "Patterns" })}
            </div>
            <div className="flex flex-col gap-1">
              {CORE_BLOCK_PATTERNS.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  className="rounded-md border p-2 text-left text-xs hover:bg-muted"
                  onClick={() => console.log("insertPattern", p.code)}
                >
                  {resolveLocalizedValue(p.label, VIEWER_CTX) ?? p.code}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
