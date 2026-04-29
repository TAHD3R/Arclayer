import type {
  ArticleBySlugQueryData,
  ArticleBySlugQueryVariables,
  ArticleEntriesQueryData,
  ArticleEntriesQueryVariables,
  CategoryEntriesQueryData,
  CategoryEntriesQueryVariables,
  CategoryBySlugQueryData,
  CategoryBySlugQueryVariables,
  DeliveryPerspective,
  DeliverySdkOptions,
  GraphQLExecutionResult,
  GraphQLResponse,
  GraphQLVariables,
  PageEntriesQueryData,
  PageEntriesQueryVariables,
  PageEntryByPathQueryData,
  PageEntryByPathQueryVariables,
  ResolvePageQueryData,
  ResolvePageQueryVariables,
  ReusableSectionEntriesQueryData,
  ReusableSectionEntriesQueryVariables,
  ReusableSectionByAliasQueryData,
  ReusableSectionByAliasQueryVariables,
  TypedDocumentString,
} from "./types";
import { DeliveryGraphQLError } from "./errors";
import {
  createDeliveryHeaders,
  normalizeDeliveryBaseUrl,
  readDeliveryRequestId,
  toGraphqlPerspective,
} from "./auth";

const buildGraphqlResult = <T>(
  response: Response,
  payload: GraphQLResponse<T>,
): GraphQLExecutionResult<T> => ({
  data: payload.data as T,
  message: "OK",
  meta: undefined,
  requestId: readDeliveryRequestId(response),
  status: response.status,
});

export class DeliveryGraphQLClient {
  constructor(private readonly options: DeliverySdkOptions) {}

  async execute<TResult, TVariables extends GraphQLVariables = GraphQLVariables>(input: {
    document: TypedDocumentString<TResult, TVariables> | string;
    operationName?: string;
    runtimeId: string;
    variables?: TVariables;
  }): Promise<GraphQLExecutionResult<TResult>> {
    const headers = await createDeliveryHeaders(this.options, {
      "Content-Type": "application/json",
    });
    const response = await (this.options.fetch ?? globalThis.fetch)(
      `${normalizeDeliveryBaseUrl(this.options.baseUrl)}/content-api/v1/runtimes/${input.runtimeId}/graphql`,
      {
        body: JSON.stringify({
          operationName: input.operationName,
          query: String(input.document),
          variables: input.variables ?? {},
        }),
        headers,
        method: "POST",
      },
    );
    const payload = (await response.json()) as GraphQLResponse<TResult>;
    if (!response.ok || payload.errors?.length) {
      throw new DeliveryGraphQLError({
        errors: payload.errors ?? [
          {
            message: response.statusText || "GraphQL request failed",
          },
        ],
        requestId: readDeliveryRequestId(response),
        status: response.status,
      });
    }
    return buildGraphqlResult(response, payload);
  }

  resolvePage(input: {
    path: string;
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
  }) {
    return this.execute<ResolvePageQueryData, ResolvePageQueryVariables>({
      document: resolvePageDocument,
      runtimeId: input.runtimeId,
      variables: {
        path: input.path,
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
      },
    });
  }

  articleBySlug(input: {
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
    slug: string;
  }) {
    return this.execute<ArticleBySlugQueryData, ArticleBySlugQueryVariables>({
      document: articleBySlugDocument,
      runtimeId: input.runtimeId,
      variables: {
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
        slug: input.slug,
      },
    });
  }

  articleEntries(input: {
    filter?: ArticleEntriesQueryVariables["filter"];
    limit?: number;
    offset?: number;
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
    sort?: ArticleEntriesQueryVariables["sort"];
  }) {
    return this.execute<ArticleEntriesQueryData, ArticleEntriesQueryVariables>({
      document: articleEntriesDocument,
      runtimeId: input.runtimeId,
      variables: {
        filter: input.filter ?? null,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
        sort: input.sort ?? null,
      },
    });
  }

  pageEntries(input: {
    filter?: PageEntriesQueryVariables["filter"];
    limit?: number;
    offset?: number;
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
    sort?: PageEntriesQueryVariables["sort"];
  }) {
    return this.execute<PageEntriesQueryData, PageEntriesQueryVariables>({
      document: pageEntriesDocument,
      runtimeId: input.runtimeId,
      variables: {
        filter: input.filter ?? null,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
        sort: input.sort ?? null,
      },
    });
  }

  pageEntryByPath(input: {
    path: string;
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
  }) {
    return this.execute<PageEntryByPathQueryData, PageEntryByPathQueryVariables>({
      document: pageEntryByPathDocument,
      runtimeId: input.runtimeId,
      variables: {
        path: input.path,
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
      },
    });
  }

  reusableSectionByAlias(input: {
    alias: string;
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
  }) {
    return this.execute<ReusableSectionByAliasQueryData, ReusableSectionByAliasQueryVariables>({
      document: reusableSectionByAliasDocument,
      runtimeId: input.runtimeId,
      variables: {
        alias: input.alias,
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
      },
    });
  }

  reusableSectionEntries(input: {
    filter?: ReusableSectionEntriesQueryVariables["filter"];
    limit?: number;
    offset?: number;
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
    sort?: ReusableSectionEntriesQueryVariables["sort"];
  }) {
    return this.execute<ReusableSectionEntriesQueryData, ReusableSectionEntriesQueryVariables>({
      document: reusableSectionEntriesDocument,
      runtimeId: input.runtimeId,
      variables: {
        filter: input.filter ?? null,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
        sort: input.sort ?? null,
      },
    });
  }

  categoryBySlug(input: {
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
    slug: string;
  }) {
    return this.execute<CategoryBySlugQueryData, CategoryBySlugQueryVariables>({
      document: categoryBySlugDocument,
      runtimeId: input.runtimeId,
      variables: {
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
        slug: input.slug,
      },
    });
  }

  categoryEntries(input: {
    filter?: CategoryEntriesQueryVariables["filter"];
    limit?: number;
    offset?: number;
    perspective?: DeliveryPerspective;
    previewToken?: string | null;
    runtimeId: string;
    sort?: CategoryEntriesQueryVariables["sort"];
  }) {
    return this.execute<CategoryEntriesQueryData, CategoryEntriesQueryVariables>({
      document: categoryEntriesDocument,
      runtimeId: input.runtimeId,
      variables: {
        filter: input.filter ?? null,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
        perspective: toGraphqlPerspective(input.perspective ?? "published"),
        previewToken: input.previewToken ?? null,
        sort: input.sort ?? null,
      },
    });
  }
}

export const resolvePageDocument = `
query ResolvePage($path: String!, $perspective: DeliveryPerspective!, $previewToken: String) {
  resolvePage(path: $path, perspective: $perspective, previewToken: $previewToken) {
    match {
      kind
      params
      pageId
      variantId
      revision
      revisionState
      draftRevision
      publishedRevision
    }
    pageMeta {
      title
      description
    }
    context {
      routeParams
      primary {
        id
        modelKey
        slug
        title
        data
      }
    }
    document {
      path
      layout
      sections {
        id
        componentKey
        props
      }
    }
    warnings {
      code
      message
      refEntryId
      refNodeId
    }
  }
}
` as TypedDocumentString<ResolvePageQueryData, ResolvePageQueryVariables>;

export const articleBySlugDocument = `
query ArticleBySlug($slug: String!, $perspective: DeliveryPerspective!, $previewToken: String) {
  articleBySlug(slug: $slug, perspective: $perspective, previewToken: $previewToken) {
    id
    locale
    revision
    revisionState
    draftRevision
    publishedRevision
    title
    slug
    summary
    content
    publishedAt
    customFields
  }
}
` as TypedDocumentString<ArticleBySlugQueryData, ArticleBySlugQueryVariables>;

export const articleEntriesDocument = `
query ArticleEntries(
  $perspective: DeliveryPerspective!,
  $previewToken: String,
  $filter: ArticleFilterInput,
  $sort: ArticleSortInput,
  $limit: Int!,
  $offset: Int!
) {
  articleEntries: articles(
    perspective: $perspective,
    previewToken: $previewToken,
    filter: $filter,
    sort: $sort,
    limit: $limit,
    offset: $offset
  ) {
    id
    locale
    revision
    revisionState
    draftRevision
    publishedRevision
    title
    slug
    summary
    content
    publishedAt
    customFields
  }
}
` as TypedDocumentString<ArticleEntriesQueryData, ArticleEntriesQueryVariables>;

export const pageEntriesDocument = `
query PageEntries(
  $perspective: DeliveryPerspective!,
  $previewToken: String,
  $filter: PageFilterInput,
  $sort: PageSortInput,
  $limit: Int!,
  $offset: Int!
) {
  pages(
    perspective: $perspective,
    previewToken: $previewToken,
    filter: $filter,
    sort: $sort,
    limit: $limit,
    offset: $offset
  ) {
    id
    locale
    revision
    revisionState
    draftRevision
    publishedRevision
    title
    path
    routePattern
    customFields
  }
}
` as TypedDocumentString<PageEntriesQueryData, PageEntriesQueryVariables>;

export const pageEntryByPathDocument = `
query PageEntryByPath($path: String!, $perspective: DeliveryPerspective!, $previewToken: String) {
  pageEntryByPath(path: $path, perspective: $perspective, previewToken: $previewToken) {
    id
    locale
    revision
    revisionState
    draftRevision
    publishedRevision
    title
    path
    routePattern
    customFields
  }
}
` as TypedDocumentString<PageEntryByPathQueryData, PageEntryByPathQueryVariables>;

export const reusableSectionByAliasDocument = `
query ReusableSectionByAlias($alias: String!, $perspective: DeliveryPerspective!, $previewToken: String) {
  reusableSectionByAlias(alias: $alias, perspective: $perspective, previewToken: $previewToken) {
    id
    locale
    revision
    revisionState
    draftRevision
    publishedRevision
    title
    sectionKey
    propsDefaults
    customFields
  }
}
` as TypedDocumentString<ReusableSectionByAliasQueryData, ReusableSectionByAliasQueryVariables>;

export const reusableSectionEntriesDocument = `
query ReusableSectionEntries(
  $perspective: DeliveryPerspective!,
  $previewToken: String,
  $filter: ReusableSectionFilterInput,
  $sort: ReusableSectionSortInput,
  $limit: Int!,
  $offset: Int!
) {
  reusableSections(
    perspective: $perspective,
    previewToken: $previewToken,
    filter: $filter,
    sort: $sort,
    limit: $limit,
    offset: $offset
  ) {
    id
    locale
    revision
    revisionState
    draftRevision
    publishedRevision
    title
    sectionKey
    propsDefaults
    customFields
  }
}
` as TypedDocumentString<ReusableSectionEntriesQueryData, ReusableSectionEntriesQueryVariables>;

export const categoryBySlugDocument = `
query CategoryBySlug($slug: String!, $perspective: DeliveryPerspective!, $previewToken: String) {
  categoryBySlug(slug: $slug, perspective: $perspective, previewToken: $previewToken) {
    id
    locale
    revision
    revisionState
    draftRevision
    publishedRevision
    name
    slug
    description
    customFields
  }
}
` as TypedDocumentString<CategoryBySlugQueryData, CategoryBySlugQueryVariables>;

export const categoryEntriesDocument = `
query CategoryEntries(
  $perspective: DeliveryPerspective!,
  $previewToken: String,
  $filter: CategoryFilterInput,
  $sort: CategorySortInput,
  $limit: Int!,
  $offset: Int!
) {
  categories(
    perspective: $perspective,
    previewToken: $previewToken,
    filter: $filter,
    sort: $sort,
    limit: $limit,
    offset: $offset
  ) {
    id
    locale
    revision
    revisionState
    draftRevision
    publishedRevision
    name
    slug
    description
    customFields
  }
}
` as TypedDocumentString<CategoryEntriesQueryData, CategoryEntriesQueryVariables>;
