import type { SitePageTreeNode, SitePageUserSummary } from "@/types/api";

export type PageType = "static" | "template";
export type PageStatus = "draft" | "published";

export type ContentPageRow = {
  id: string;
  title: string | null;
  description: string | null;
  path: string;
  parentId: string | null;
  sortOrder: number;
  level: number;
  visibility: "public" | "private";
  draftRevision: number;
  publishedRevision: number | null;
  pageType: PageType;
  status: PageStatus;
  updatedAt: string | null;
  updatedBy: SitePageUserSummary | null;
};

export type ContentPagesFilters = {
  status: "all" | PageStatus;
  visibility: "all" | "public" | "private";
};

export type ContentPagesSortKey =
  | "-updated_at"
  | "updated_at"
  | "title"
  | "-title"
  | "path"
  | "-path";

export type ContentPageFormValues = {
  title: string;
  description: string;
  path: string;
  type: PageType;
  visibility: "public" | "private";
  parentId: string | null;
  contentMode: "blank" | "copy";
  sourcePageId: string | null;
};

export type ContentPageSheetMode = "create" | "edit";

export type ContentPageTreeLikeNode = SitePageTreeNode;
