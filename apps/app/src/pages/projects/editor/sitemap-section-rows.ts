import type { BuilderRevisionGlobalSectionOut, BuilderRevisionPageOut } from "@arclayer/openapi";

export interface SitemapSectionRow {
  /** Intent id when the page is intent-driven; wireframe section id as a read-only fallback. */
  id: string;
  title: string;
  description: string | null;
  /** Intent-driven rows can be renamed, reordered, and removed through `page.intent.replace`. */
  editable: boolean;
  globalReferenceId: string | null;
  globalTitle: string | null;
}

/**
 * The Sitemap stage renders the plan layer: `sectionIntents` drive the cards. Pages with a
 * wireframe but no intents fall back to read-only labels derived from the wireframe sections.
 */
export function collectSitemapSectionRows(
  page: BuilderRevisionPageOut,
  globalSections: readonly BuilderRevisionGlobalSectionOut[],
): SitemapSectionRow[] {
  const globalTitles = new Map(globalSections.map((section) => [section.itemId, section.title]));
  const globalByIntentId = new Map<string, string>();
  for (const section of page.wireframe?.sections ?? []) {
    if (section.globalReferenceId && section.intentId) {
      globalByIntentId.set(section.intentId, section.globalReferenceId);
    }
  }

  if (page.sectionIntents?.length) {
    return page.sectionIntents.map((intent) => {
      const globalReferenceId = globalByIntentId.get(intent.id) ?? null;
      return {
        id: intent.id,
        title: intent.label,
        description: intent.goal ?? null,
        editable: true,
        globalReferenceId,
        globalTitle: globalReferenceId ? (globalTitles.get(globalReferenceId) ?? null) : null,
      };
    });
  }

  return (page.wireframe?.sections ?? []).map((section) => ({
    id: section.intentId ?? section.id,
    title: section.label,
    description: null,
    editable: false,
    globalReferenceId: section.globalReferenceId ?? null,
    globalTitle: section.globalReferenceId
      ? (globalTitles.get(section.globalReferenceId) ?? null)
      : null,
  }));
}
