import type { DeliverySdkOptions } from "./types";
import { DeliveryGraphQLClient } from "./graphql-client";
import { DeliveryRestClient } from "./rest-client";

export const createDeliverySdk = (options: DeliverySdkOptions) => {
  const rest = new DeliveryRestClient(options);
  const graphql = new DeliveryGraphQLClient(options);

  return {
    graphql,
    content: {
      articleBySlug: graphql.articleBySlug.bind(graphql),
      articleEntries: graphql.articleEntries.bind(graphql),
      categoryEntries: graphql.categoryEntries.bind(graphql),
      categoryBySlug: graphql.categoryBySlug.bind(graphql),
      pageEntries: graphql.pageEntries.bind(graphql),
      pageEntryByPath: graphql.pageEntryByPath.bind(graphql),
      reusableSectionEntries: graphql.reusableSectionEntries.bind(graphql),
      reusableSectionByAlias: graphql.reusableSectionByAlias.bind(graphql),
    },
    menus: {
      get: rest.getMenu.bind(rest),
    },
    runtime: {
      get: rest.getRuntimeConfig.bind(rest),
    },
    routes: {
      resolve: rest.resolveRoute.bind(rest),
    },
    pages: {
      byId: rest.getPageById.bind(rest),
      resolve: rest.resolvePage.bind(rest),
    },
    globalSets: {
      resolve: rest.resolveGlobalSet.bind(rest),
    },
    sections: {
      byAlias: rest.getSectionByAlias.bind(rest),
    },
    styles: {
      get: rest.getStyle.bind(rest),
    },
  };
};

export { createDeliveryHeaders, normalizeDeliveryBaseUrl, toGraphqlPerspective } from "./auth";
export {
  DeliveryApiError,
  DeliveryGraphQLError,
  isDeliveryApiError,
  isDeliveryGraphQLError,
} from "./errors";
export {
  DeliveryGraphQLClient,
  articleBySlugDocument,
  articleEntriesDocument,
  categoryEntriesDocument,
  categoryBySlugDocument,
  pageEntriesDocument,
  pageEntryByPathDocument,
  resolvePageDocument,
  reusableSectionEntriesDocument,
  reusableSectionByAliasDocument,
} from "./graphql-client";
export {
  deliveryGraphqlManifest,
  getDeliveryGraphqlListQueryContract,
  getDeliveryGraphqlManifest,
  getDeliveryGraphqlModel,
  getDeliveryGraphqlSingleQueryContract,
  listDeliveryGraphqlModels,
  listDeliveryGraphqlSubscriptionEvents,
} from "./graphql-manifest";
export { buildDeliveryGraphqlListQueryInput } from "./graphql-query-input";
export { DeliveryRestClient } from "./rest-client";
export type {
  ApiEnvelope,
  ArticleBySlugQueryData,
  ArticleBySlugQueryVariables,
  ArticleEntriesQueryData,
  ArticleEntriesQueryVariables,
  ArticleEntry,
  CategoryEntriesQueryData,
  CategoryEntriesQueryVariables,
  CategoryBySlugQueryData,
  CategoryBySlugQueryVariables,
  CategoryEntry,
  DeliveryGlobalSet,
  DeliveryMenu,
  DeliveryPageResolveOut,
  DeliveryPerspective,
  DeliveryRequestMetadata,
  DeliveryResult,
  DeliveryRouteResolveOut,
  DeliveryRuntimeConfig,
  DeliverySection,
  DeliverySdkOptions,
  DeliveryStyle,
  GraphQLExecutionResult,
  GraphQLErrorExtension,
  GraphQLErrorPayload,
  GraphQLResponse,
  GraphQLVariables,
  GraphQLDeliveryPage,
  GraphQLFlattenedPage,
  GraphQLFlattenedSection,
  GraphQLPageMeta,
  GraphQLPerspective,
  GraphQLPrimaryContext,
  GraphQLQueryVariables,
  GraphQLResolveWarning,
  GraphQLRouteContext,
  GraphQLRouteMatch,
  MaybePromise,
  PageEntriesQueryData,
  PageEntriesQueryVariables,
  PageEntry,
  PageEntryByPathQueryData,
  PageEntryByPathQueryVariables,
  ResolvePageQueryData,
  ResolvePageQueryVariables,
  ReusableSectionEntriesQueryData,
  ReusableSectionEntriesQueryVariables,
  ReusableSectionByAliasQueryData,
  ReusableSectionByAliasQueryVariables,
  ReusableSectionEntry,
  TypedDocumentString,
} from "./types";
export type {
  GraphQLManifestFieldDefinition,
  GraphQLManifestHookDefinition,
  GraphQLManifestModelDefinition,
  GraphQLManifestQueryInput,
  GraphQLManifestSubscriptionEventDefinition,
  GraphQLSchemaManifest,
} from "./graphql-manifest";
export type {
  DeliveryGraphqlQueryInput,
  DeliveryGraphqlQueryPaginationInput,
  DeliveryGraphqlQuerySortInput,
} from "./graphql-query-input";
