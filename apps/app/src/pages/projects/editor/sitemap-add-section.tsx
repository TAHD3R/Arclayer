import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@arclayer/ui/command";
import type { BuilderRevisionGlobalSectionOut } from "@arclayer/openapi";
import { Layers3, LayoutTemplate, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EditorFloatingCard } from "@/pages/projects/editor/editor-floating-card";

export interface SitemapSectionPreset {
  key: string;
  labelKey: string;
  goalKey: string;
  icon: LucideIcon;
}

/** Curated sitemap-level presets mirroring Relume's section categories. */
export const SITEMAP_SECTION_PRESETS: readonly SitemapSectionPreset[] = [
  {
    key: "navbar",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_NAVBAR",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_NAVBAR_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "hero",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_HERO",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_HERO_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "feature",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_FEATURE",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_FEATURE_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "features-list",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_FEATURES_LIST",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_FEATURES_LIST_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "stats",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_STATS",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_STATS_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "logo-list",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_LOGO_LIST",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_LOGO_LIST_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "testimonial",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_TESTIMONIAL",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_TESTIMONIAL_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "pricing",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_PRICING",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_PRICING_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "faq",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_FAQ",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_FAQ_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "cta",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_CTA",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_CTA_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "contact",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_CONTACT",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_CONTACT_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "team",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_TEAM",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_TEAM_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "blog-list",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_BLOG_LIST",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_BLOG_LIST_GOAL",
    icon: LayoutTemplate,
  },
  {
    key: "footer",
    labelKey: "CREATION_EDITOR_SITEMAP_PRESET_FOOTER",
    goalKey: "CREATION_EDITOR_SITEMAP_PRESET_FOOTER_GOAL",
    icon: LayoutTemplate,
  },
];

export interface SitemapSectionInsert {
  label: string;
  goal: string;
}

interface SitemapAddSectionPanelProps {
  open: boolean;
  anchor: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  pageTitle: string | null;
  insertLabel: string | null;
  globalSections: readonly BuilderRevisionGlobalSectionOut[];
  globalInstanceCounts: ReadonlyMap<string, number>;
  onInsertPreset: (insert: SitemapSectionInsert) => void;
  onInsertGlobal: (section: BuilderRevisionGlobalSectionOut) => void;
}

export function SitemapAddSectionPanel({
  open,
  anchor,
  onOpenChange,
  pageTitle,
  insertLabel,
  globalSections,
  globalInstanceCounts,
  onInsertPreset,
  onInsertGlobal,
}: SitemapAddSectionPanelProps) {
  const { t } = useTranslation("account");
  const [query, setQuery] = useState("");

  const filteredPresets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SITEMAP_SECTION_PRESETS;
    return SITEMAP_SECTION_PRESETS.filter((preset) =>
      t(preset.labelKey).toLowerCase().includes(needle),
    );
  }, [query, t]);

  const filteredGlobals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return globalSections;
    return globalSections.filter((section) => section.title.toLowerCase().includes(needle));
  }, [globalSections, query]);

  return (
    <EditorFloatingCard
      open={open}
      anchor={anchor}
      onOpenChange={onOpenChange}
      title={t("CREATION_EDITOR_SITEMAP_ADD_SECTION_TITLE")}
      description={
        insertLabel
          ? t("CREATION_EDITOR_SITEMAP_ADD_SECTION_AT_DESC", {
              page: pageTitle ?? "",
              position: insertLabel,
            })
          : t("CREATION_EDITOR_SITEMAP_ADD_SECTION_DESC", { page: pageTitle ?? "" })
      }
      widthClass="w-[min(24rem,calc(100vw-2rem))]"
      bodyClassName="flex flex-col"
    >
      <Command className="min-h-0 flex-1 flex-col overflow-hidden" shouldFilter={false}>
        <div className="border-b border-border px-3 py-2">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("CREATION_EDITOR_SITEMAP_ADD_SECTION_SEARCH")}
          />
        </div>
        <CommandList className="max-h-80 min-h-0">
          <CommandEmpty>{t("CREATION_EDITOR_SITEMAP_ADD_SECTION_EMPTY")}</CommandEmpty>
          {filteredGlobals.length ? (
            <CommandGroup heading={t("CREATION_EDITOR_SITEMAP_ADD_SECTION_GLOBALS")}>
              {filteredGlobals.map((section) => (
                <CommandItem
                  key={section.itemId}
                  value={`global:${section.itemId}`}
                  onSelect={() => {
                    onInsertGlobal(section);
                    onOpenChange(false);
                  }}
                >
                  <Layers3 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{section.title}</span>
                  <span className="shrink-0 text-caption text-label-tertiary">
                    {t("CREATION_EDITOR_SITEMAP_ADD_SECTION_INSTANCES", {
                      count: globalInstanceCounts.get(section.itemId) ?? 0,
                    })}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading={t("CREATION_EDITOR_SITEMAP_ADD_SECTION_CATEGORIES")}>
            {filteredPresets.map((preset) => (
              <CommandItem
                key={preset.key}
                value={`preset:${preset.key}`}
                onSelect={() => {
                  onInsertPreset({ label: t(preset.labelKey), goal: t(preset.goalKey) });
                  onOpenChange(false);
                }}
              >
                <preset.icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{t(preset.labelKey)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </EditorFloatingCard>
  );
}
