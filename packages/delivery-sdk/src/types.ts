export type MaybePromise<T> = T | Promise<T>;

export interface ApiEnvelope<T> {
  data?: T | null;
  error?: string | null;
  message?: string;
  meta?: Record<string, unknown> | null;
  timestamp?: number;
}

export interface ApiRequestMetadata {
  message: string;
  meta?: Record<string, unknown> | null;
  requestId: string | null;
  status: number;
  timestamp?: number;
}

export interface ApiResult<T> extends ApiRequestMetadata {
  data: T;
}

export type DeliveryPerspective = "published" | "preview";
export type GraphQLPerspective = "PUBLISHED" | "PREVIEW";
export type GraphQLVariables = object;

export interface DeliverySdkOptions {
  baseUrl: string;
  deliveryKey?: string | (() => MaybePromise<string | null | undefined>);
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

export type DeliveryRequestMetadata = ApiRequestMetadata;

export type DeliveryResult<T> = ApiResult<T>;

export type GraphQLExecutionResult<T> = ApiResult<T>;

export interface GraphQLErrorExtension {
  code?: string;
  [key: string]: unknown;
}

export interface GraphQLErrorPayload {
  extensions?: GraphQLErrorExtension;
  message: string;
  path?: Array<number | string>;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorPayload[];
}

export type TypedDocumentString<
  TResult,
  TVariables extends GraphQLVariables = GraphQLVariables,
> = string & {
  __resultType?: TResult;
  __variablesType?: TVariables;
};

export const defineQuery = <TResult, TVariables extends GraphQLVariables = GraphQLVariables>(
  source: string,
): TypedDocumentString<TResult, TVariables> => source as TypedDocumentString<TResult, TVariables>;

export interface GraphQLFlattenedSection {
  componentKey: string;
  id: string;
  props: Record<string, unknown>;
}

export interface GraphQLFlattenedPage {
  layout: Record<string, unknown> | null;
  path: string;
  sections: GraphQLFlattenedSection[];
}

export interface GraphQLPageMeta {
  description: string | null;
  title: string | null;
}

export interface GraphQLPrimaryContext {
  data: Record<string, unknown>;
  id: string;
  modelKey: string | null;
  slug: string | null;
  title: string | null;
}

export interface GraphQLRouteContext {
  primary: GraphQLPrimaryContext | null;
  routeParams: Record<string, unknown>;
}

export interface GraphQLRouteMatch {
  draftRevision: number | null;
  kind: string;
  pageId: string | null;
  params: Record<string, unknown>;
  publishedRevision: number | null;
  revision: number | null;
  revisionState: string | null;
  variantId: string | null;
}

export interface GraphQLResolveWarning {
  code: string;
  message: string;
  refEntryId: string | null;
  refNodeId: string | null;
}

export interface GraphQLDeliveryPage {
  context: GraphQLRouteContext | null;
  document: GraphQLFlattenedPage | null;
  match: GraphQLRouteMatch;
  pageMeta: GraphQLPageMeta | null;
  warnings: GraphQLResolveWarning[] | null;
}

export interface ArticleEntry {
  content: string | null;
  customFields: Record<string, unknown>;
  draftRevision: number;
  id: string;
  locale: string;
  publishedAt: string | null;
  publishedRevision: number | null;
  revision: number;
  revisionState: string;
  slug: string | null;
  summary: string | null;
  title: string | null;
}

export interface PageEntry {
  customFields: Record<string, unknown>;
  draftRevision: number;
  id: string;
  locale: string;
  path: string | null;
  publishedRevision: number | null;
  revision: number;
  revisionState: string;
  routePattern: string | null;
  title: string | null;
}

export interface ReusableSectionEntry {
  customFields: Record<string, unknown>;
  draftRevision: number;
  id: string;
  locale: string;
  propsDefaults: Record<string, unknown> | null;
  publishedRevision: number | null;
  revision: number;
  revisionState: string;
  sectionKey: string | null;
  title: string | null;
}

export interface CategoryEntry {
  customFields: Record<string, unknown>;
  description: string | null;
  draftRevision: number;
  id: string;
  locale: string;
  name: string | null;
  publishedRevision: number | null;
  revision: number;
  revisionState: string;
  slug: string | null;
}

export interface ResolvePageQueryData {
  resolvePage: GraphQLDeliveryPage | null;
}

export interface ArticleBySlugQueryData {
  articleBySlug: ArticleEntry | null;
}

export interface PageEntryByPathQueryData {
  pageEntryByPath: PageEntry | null;
}

export interface ReusableSectionByAliasQueryData {
  reusableSectionByAlias: ReusableSectionEntry | null;
}

export interface CategoryBySlugQueryData {
  categoryBySlug: CategoryEntry | null;
}

export interface ArticleEntriesQueryData {
  articleEntries: ArticleEntry[];
}

export interface PageEntriesQueryData {
  pages: PageEntry[];
}

export interface ReusableSectionEntriesQueryData {
  reusableSections: ReusableSectionEntry[];
}

export interface CategoryEntriesQueryData {
  categories: CategoryEntry[];
}

export interface GraphQLQueryVariables {
  perspective: GraphQLPerspective;
  previewToken?: string | null;
}

export interface ResolvePageQueryVariables extends GraphQLQueryVariables {
  path: string;
}

export interface ArticleBySlugQueryVariables extends GraphQLQueryVariables {
  slug: string;
}

export interface PageEntryByPathQueryVariables extends GraphQLQueryVariables {
  path: string;
}

export interface ReusableSectionByAliasQueryVariables extends GraphQLQueryVariables {
  alias: string;
}

export interface CategoryBySlugQueryVariables extends GraphQLQueryVariables {
  slug: string;
}

export interface ArticleEntriesQueryVariables extends GraphQLQueryVariables {
  filter?: {
    revisionState?: string | null;
    slug?: string | null;
    titleContains?: string | null;
  } | null;
  limit: number;
  offset: number;
  sort?: {
    direction?: "ASC" | "DESC";
    field: "TITLE" | "SLUG" | "REVISION";
  } | null;
}

export interface PageEntriesQueryVariables extends GraphQLQueryVariables {
  filter?: {
    path?: string | null;
    revisionState?: string | null;
    titleContains?: string | null;
  } | null;
  limit: number;
  offset: number;
  sort?: {
    direction?: "ASC" | "DESC";
    field: "TITLE" | "PATH" | "REVISION";
  } | null;
}

export interface ReusableSectionEntriesQueryVariables extends GraphQLQueryVariables {
  filter?: {
    revisionState?: string | null;
    sectionKey?: string | null;
    titleContains?: string | null;
  } | null;
  limit: number;
  offset: number;
  sort?: {
    direction?: "ASC" | "DESC";
    field: "TITLE" | "SECTION_KEY" | "REVISION";
  } | null;
}

export interface CategoryEntriesQueryVariables extends GraphQLQueryVariables {
  filter?: {
    nameContains?: string | null;
    revisionState?: string | null;
    slug?: string | null;
  } | null;
  limit: number;
  offset: number;
  sort?: {
    direction?: "ASC" | "DESC";
    field: "NAME" | "SLUG" | "REVISION";
  } | null;
}

export type DeliveryPageResolveOut = import("@arclayer/openapi").SiteRouteResolveOut;
export type DeliveryRouteResolveOut = import("@arclayer/openapi").SiteRouteResolveOut;
export type DeliveryRuntimeConfig = import("@arclayer/openapi").SiteRuntimeOut;
export type DeliverySection = import("@arclayer/openapi").DeliverySectionOut;
export type DeliveryGlobalSet = import("@arclayer/openapi").DeliveryGlobalSetOut;
export type DeliveryMenu = import("@arclayer/openapi").DeliveryMenuOut;
export type DeliveryStyle = import("@arclayer/openapi").DeliveryStyleOut;
