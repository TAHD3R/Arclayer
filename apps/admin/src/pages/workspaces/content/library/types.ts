import type {
  AdminContentItem,
  AdminContentModel,
  AdminContentModelCapability,
  AdminContentModelCategory,
} from "@/types/api";

export type ContentLibraryDerivedStatus = "published" | "changed" | "draft" | "archived";
export type ContentLibraryRuntime = "text" | "visual" | "data" | "unknown";
export type ContentLibraryContext = AdminContentModelCategory | "standalone";

export type ContentLibraryScopeId =
  | "quick:all"
  | "quick:recent"
  | "quick:draft"
  | "quick:published"
  | "quick:archived"
  | `tree:type:${string}`;

export type ContentLibraryToolbarFilters = {
  status?: ContentLibraryDerivedStatus;
  modelKey?: string;
};

export type ContentLibraryTableRow = AdminContentItem & {
  name: string;
  modelName?: string | null;
  modelDescription?: string | null;
  modelCategory?: AdminContentModelCategory | null;
  modelCapabilities: AdminContentModelCapability[];
  derivedStatus: ContentLibraryDerivedStatus;
  runtime: ContentLibraryRuntime;
  context: ContentLibraryContext;
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
