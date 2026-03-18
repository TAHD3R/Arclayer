import type { AdminContentItem, AdminContentModel, AdminContentModelCapability } from "@/types/api";

export type ContentLibraryDerivedStatus = "published" | "changed" | "draft" | "archived";

export type ContentLibraryScopeId =
  | "quick:all"
  | "quick:recent"
  | "quick:draft"
  | "quick:published"
  | `tree:type:${string}`;

export type ContentLibraryToolbarFilters = {
  status?: ContentLibraryDerivedStatus;
  modelKey?: string;
};

export type ContentLibraryTableRow = AdminContentItem & {
  name: string;
  modelName?: string | null;
  modelDescription?: string | null;
  modelCapabilities: AdminContentModelCapability[];
  derivedStatus: ContentLibraryDerivedStatus;
  archiveVersionNumber: number | null;
};

export type ContentLibrarySidebarCounts = {
  all: number;
  recent: number;
  statuses: Record<ContentLibraryDerivedStatus, number>;
  models: Record<string, number>;
};

export type ContentLibrarySidebarModel = Pick<
  AdminContentModel,
  "id" | "key" | "name" | "description" | "capabilities"
>;
