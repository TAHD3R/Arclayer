import { Blocks, FolderTree, LayoutTemplate, Newspaper, type LucideIcon } from "lucide-react";

import type { AdminContentModel } from "@/types/api";

type TranslateFn = (key: string) => string;
export type ContentBootstrapVariant = "article" | "page" | "reusable-section" | "category";

type OfficialContentTypePresentation = {
  key: "article" | "page" | "reusable-section" | "category";
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
  page: {
    key: "page",
    nameKey: "CONTENT_TYPE_PAGE_NAME",
    descriptionKey: "CONTENT_TYPE_PAGE_DESC",
    icon: LayoutTemplate,
    order: 1,
  },
  "reusable-section": {
    key: "reusable-section",
    nameKey: "CONTENT_TYPE_REUSABLE_SECTION_NAME",
    descriptionKey: "CONTENT_TYPE_REUSABLE_SECTION_DESC",
    icon: Blocks,
    order: 2,
  },
  category: {
    key: "category",
    nameKey: "CONTENT_TYPE_CATEGORY_NAME",
    descriptionKey: "CONTENT_TYPE_CATEGORY_DESC",
    icon: FolderTree,
    order: 3,
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

export function filterOfficialContentModels(
  models: readonly AdminContentModel[],
): AdminContentModel[] {
  return sortContentModelsByPresentation(models).filter((model) =>
    Boolean(getOfficialContentTypePresentation(model.key)),
  );
}

export function resolveContentBootstrapVariant(
  model:
    | Pick<
        AdminContentModel,
        "key" | "category" | "capabilities" | "defaultRole" | "defaultPosture" | "defaultSurface"
      >
    | null
    | undefined,
): ContentBootstrapVariant | null {
  if (!model) return null;

  const official = getOfficialContentTypePresentation(model.key);
  if (official?.key === "article") return "article";
  if (official?.key === "page") return "page";
  if (official?.key === "reusable-section") return "reusable-section";
  if (official?.key === "category") return "category";

  if (model.defaultRole === "article" || model.defaultSurface === "writing") return "article";
  if (
    model.defaultRole === "page" ||
    model.defaultPosture === "page" ||
    model.defaultSurface === "canvas" ||
    model.category === "site_builder" ||
    model.capabilities.includes("routable")
  ) {
    return "page";
  }
  if (model.defaultRole === "reusable-section") return "reusable-section";
  if (model.defaultRole === "taxonomy") return "category";
  if (
    model.defaultSurface === "structured" ||
    model.capabilities.includes("queryable") ||
    model.capabilities.includes("has_relations")
  ) {
    return "category";
  }
  return "category";
}
