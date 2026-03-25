import type {
  AdminContentItem,
  AdminContentModel,
  AdminContentModelCapability,
  AdminContentModelCategory,
  AdminContentSeoProfile,
  AdminContentVersion,
  AdminPublishImpact,
} from "@/types/api";

export type ContentLibraryDerivedStatus = "published" | "changed" | "draft" | "archived";
export type ContentLibraryRuntime = "text" | "visual" | "data" | "unknown";
export type ContentLibraryContext = AdminContentModelCategory | "standalone";
export type ContentLibraryRole =
  | "page"
  | "article"
  | "reusable-section"
  | "taxonomy"
  | "person"
  | "settings"
  | "data"
  | "general";
export type ContentLibraryLibraryGroup = "site-content" | "general-content" | "structured-content";
export type ContentLibraryEditWith = "canvas" | "writing" | "structured";
export type ContentLibrarySystemViewId =
  | "all"
  | "site-content"
  | "draft"
  | "published"
  | "needs-attention";

export type ContentLibraryToolbarFilters = {
  status?: ContentLibraryDerivedStatus;
  modelKey?: string;
  role?: ContentLibraryRole;
  editWith?: ContentLibraryEditWith;
};

export type ContentLibrarySystemViewState = {
  kind: "system";
  viewId: ContentLibrarySystemViewId;
};

export type ContentLibrarySavedViewState = {
  kind: "saved";
  viewId: string;
};

export type ContentLibraryViewState = ContentLibrarySystemViewState | ContentLibrarySavedViewState;

export type ContentLibraryViewDefinition = {
  id: ContentLibrarySystemViewId;
  labelKey: string;
};

export type ContentLibrarySavedView = {
  id: string;
  name: string;
  baseViewId: ContentLibrarySystemViewId;
  query: string;
  filters: ContentLibraryToolbarFilters;
  pinned: boolean;
};

export type ContentLibraryFacetOption<TValue extends string> = {
  id: TValue;
  labelKey: string;
};

export type ContentLibraryScopeId =
  | "quick:all"
  | "quick:recent"
  | "quick:draft"
  | "quick:published"
  | "quick:archived"
  | `tree:type:${string}`;

export type ContentLibraryTableRow = AdminContentItem & {
  name: string;
  modelName?: string | null;
  modelDescription?: string | null;
  modelCategory?: AdminContentModelCategory | null;
  modelCapabilities: AdminContentModelCapability[];
  derivedStatus: ContentLibraryDerivedStatus;
  runtime: ContentLibraryRuntime;
  context: ContentLibraryContext;
  libraryGroup: ContentLibraryLibraryGroup;
  editWith: ContentLibraryEditWith;
  role: ContentLibraryRole;
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

export type ContentLibrarySelectedVersions = {
  draft: AdminContentVersion | null;
  published: AdminContentVersion | null;
  loading: boolean;
  error: boolean;
};

export type ContentLibrarySelectedSeo = {
  supported: boolean;
  data: AdminContentSeoProfile | null;
  loading: boolean;
  error: boolean;
};

export type ContentLibrarySelectedPublishImpact = {
  missingRoute: boolean;
  unresolvedRelations: boolean;
  unpublishedDependencies: boolean;
  loading: boolean;
  error: boolean;
  hasBlockers: boolean;
  source: AdminPublishImpact | null;
};
