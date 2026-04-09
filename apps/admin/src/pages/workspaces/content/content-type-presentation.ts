import { FolderTree, LayoutTemplate, Newspaper, type LucideIcon } from "lucide-react";

import type { AdminContentModel } from "@/types/api";

type TranslateFn = (key: string) => string;

type OfficialContentTypePresentation = {
  key: "article" | "landing-page" | "structured-entry";
  nameKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  order: number;
};

const OFFICIAL_CONTENT_TYPE_PRESENTATIONS = {
  article: {
    key: "article",
    nameKey: "CONTENT_TYPE_ARTICLE_NAME",
    descriptionKey: "CONTENT_TYPE_ARTICLE_DESC",
    icon: Newspaper,
    order: 0,
  },
  "landing-page": {
    key: "landing-page",
    nameKey: "CONTENT_TYPE_PAGE_NAME",
    descriptionKey: "CONTENT_TYPE_PAGE_DESC",
    icon: LayoutTemplate,
    order: 1,
  },
  "structured-entry": {
    key: "structured-entry",
    nameKey: "CONTENT_TYPE_STRUCTURED_CONTENT_NAME",
    descriptionKey: "CONTENT_TYPE_STRUCTURED_CONTENT_DESC",
    icon: FolderTree,
    order: 2,
  },
} as const satisfies Record<string, OfficialContentTypePresentation>;

export function getOfficialContentTypePresentation(
  modelKey: string | null | undefined,
): OfficialContentTypePresentation | null {
  if (!modelKey) return null;
  return (
    (OFFICIAL_CONTENT_TYPE_PRESENTATIONS as Record<string, OfficialContentTypePresentation>)[
      modelKey
    ] ?? null
  );
}

export function getContentTypeLabel(params: {
  modelKey?: string | null;
  fallbackName?: string | null;
  fallbackLabel: string;
  t: TranslateFn;
}): string {
  const official = getOfficialContentTypePresentation(params.modelKey);
  if (official) return params.t(official.nameKey);
  const fallbackName = params.fallbackName?.trim();
  return fallbackName || params.fallbackLabel;
}

export function getContentTypeDescription(params: {
  modelKey?: string | null;
  fallbackDescription?: string | null;
  t: TranslateFn;
}): string | null {
  const official = getOfficialContentTypePresentation(params.modelKey);
  if (official) return params.t(official.descriptionKey);
  return params.fallbackDescription?.trim() || null;
}

export function sortContentModelsByPresentation(
  models: readonly AdminContentModel[],
): AdminContentModel[] {
  return [...models].sort((left, right) => {
    const leftOfficial = getOfficialContentTypePresentation(left.key);
    const rightOfficial = getOfficialContentTypePresentation(right.key);

    if (leftOfficial && rightOfficial) {
      return leftOfficial.order - rightOfficial.order;
    }
    if (leftOfficial) return -1;
    if (rightOfficial) return 1;

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}
