import type { PageBlueprint } from "@celestial/site-block-protocol";

import type { PageData } from "./pagination";

export type WorkspacePageUserSummary = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type WorkspacePageTreeNode = {
  id: string;
  title: string | null;
  description: string | null;
  path: string;
  parentId: string | null;
  sortOrder: number;
  visibility: "public" | "private";
  draftRevision: number;
  publishedRevision: number | null;
  updatedAt: string | null;
  updatedBy: WorkspacePageUserSummary | null;
  children: WorkspacePageTreeNode[];
};

export type WorkspacePageCreateIn = {
  path: string;
  title?: string | null;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  visibility?: "public" | "private";
};

export type WorkspacePageUpdateIn = {
  path?: string | null;
  title?: string | null;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number | null;
  visibility?: "public" | "private" | null;
};

export type WorkspacePageMoveIn = {
  parentId?: string | null;
  sortOrder: number;
};

export type WorkspacePageDeleteOut = {
  pageId: string;
};

export type PageTreeResult<T> = PageData<T>;

export type ContentPageRevisionOut = {
  pageId: string;
  state: "draft" | "published";
  revision: number;
  createdAtMs: number;
  pageBlueprint: PageBlueprint;
  meta: Record<string, unknown> | null;
  styleOverrides: Record<string, unknown> | null;
  variantId: string | null;
  deps: Record<string, unknown> | null;
};

export type ContentPageDraftSavePayload = {
  pageBlueprint: PageBlueprint;
  meta?: Record<string, unknown> | null;
  styleOverrides?: Record<string, unknown> | null;
  variantId?: string | null;
  deps?: Record<string, unknown> | null;
  expectedRevision?: number | null;
};

export type ContentPageDraftSaveOut = {
  siteId: string;
  pageId: string;
  path: string;
  revision: number;
  savedAtMs: number;
};

export type ContentPagePublishPayload = {
  revision?: number | null;
};

export type ContentPagePublishOut = {
  siteId: string;
  pageId: string;
  path: string;
  revision: number;
  publishedAtMs: number;
};

export type ContentPageUnpublishOut = {
  siteId: string;
  pageId: string;
  path: string;
  unpublishedAtMs: number;
};
