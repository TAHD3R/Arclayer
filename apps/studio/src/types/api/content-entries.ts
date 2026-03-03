import type { PageBlueprint } from "@celestial/block-protocol";

export type ContentEntryStatus = "draft" | "published" | "archived";
export type ContentEntryVisibility = "public" | "private";
export type ContentEntryRevisionState = "draft" | "published";

export type ContentEntryOut = {
  id: string;
  workspaceId: string;
  siteId: string;
  typeId: string;
  typeCode: string;
  slug: string;
  title: string | null;
  status: ContentEntryStatus;
  visibility: ContentEntryVisibility;
  locale: string;
  path: string | null;
  parentEntryId: string | null;
  sortOrder: number;
  draftRevision: number;
  publishedRevision: number | null;
  updatedAt: string | null;
};

export type ContentEntryRevisionOut = {
  entryId: string;
  state: ContentEntryRevisionState;
  revision: number;
  createdAtMs: number;
  snapshot: {
    page_blueprint?: PageBlueprint;
    pageBlueprint?: PageBlueprint;
    field_values?: Record<string, unknown>;
    fieldValues?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
};
