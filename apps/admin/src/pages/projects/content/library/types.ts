import type {
  ContentModelOut,
  ContentItemOut,
  ContentSeoProfileOut as AdminContentSeoProfile,
  PublishReadinessOut as AdminPublishImpact,
} from "@arclayer/openapi";
import type {
  getContentLibraryViews,
  getContentItemVersion,
  listAllContentItems,
  listAllContentModels,
} from "@/api/content";

type AdminContentItem = Awaited<ReturnType<typeof listAllContentItems>>[number];
type AdminContentModel = Awaited<ReturnType<typeof listAllContentModels>>[number];
type AdminContentVersion = Awaited<ReturnType<typeof getContentItemVersion>>;

type AdminContentContinuationRole = NonNullable<ContentModelOut["defaultRole"]>;
type AdminContentContinuationSurface = NonNullable<ContentModelOut["defaultSurface"]>;
type AdminContentModelCapability = NonNullable<ContentModelOut["capabilities"]>[number];
type AdminContentModelCategory = ContentModelOut["category"];
type AdminContentWorkbenchContext = NonNullable<ContentItemOut["context"]>;
type AdminContentWorkbenchDerivedStatus = NonNullable<ContentItemOut["derivedStatus"]>;
type AdminContentWorkbenchLibraryGroup = NonNullable<ContentItemOut["libraryGroup"]>;
type AdminContentWorkbenchRuntime = NonNullable<ContentItemOut["runtime"]>;

export type ContentLibraryDerivedStatus = AdminContentWorkbenchDerivedStatus;
export type ContentLibraryRuntime = AdminContentWorkbenchRuntime;
export type ContentLibraryContext = AdminContentWorkbenchContext;
export type ContentLibraryRole = AdminContentContinuationRole;
export type ContentLibraryLibraryGroup = AdminContentWorkbenchLibraryGroup;
export type ContentLibraryEditWith = AdminContentContinuationSurface;
export type ContentLibrarySystemViewId =
  | "all"
  | "site-content"
  | "draft"
  | "published"
  | "needs-attention";

export type ContentLibraryToolbarFilters = {
  status?: ContentLibraryDerivedStatus;
  modelKey?: string;
  locale?: string;
  createdByUserId?: string;
  tag?: string;
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

export type ContentLibrarySavedView = Awaited<
  ReturnType<typeof getContentLibraryViews>
>["items"][number];

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
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  tags?: string[];
  modelName?: string | null;
  modelDescription?: string | null;
  modelCategory?: AdminContentModelCategory | null;
  modelCapabilities: AdminContentModelCapability[];
};

export type ContentLibrarySidebarCounts = {
  all: number;
  recent: number;
  statuses: Record<ContentLibraryDerivedStatus, number>;
  models: Record<string, number>;
};

export type ContentLibrarySidebarModel = Pick<
  AdminContentModel,
  "id" | "singularKey" | "name" | "description" | "capabilities"
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
