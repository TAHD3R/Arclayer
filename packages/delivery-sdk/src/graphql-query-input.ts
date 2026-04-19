import { toGraphqlPerspective } from "./auth";
import { getDeliveryGraphqlModel } from "./graphql-manifest";
import type { DeliveryPerspective, GraphQLPerspective } from "./types";

export interface DeliveryGraphqlQueryPaginationInput {
  limit?: number | null;
  offset?: number | null;
}

export interface DeliveryGraphqlQuerySortInput {
  direction?: "ASC" | "DESC" | "asc" | "desc" | null;
  field: string;
}

export interface DeliveryGraphqlQueryInput {
  filter: Record<string, string | null> | null;
  limit: number;
  offset: number;
  perspective: GraphQLPerspective;
  previewToken: string | null;
  sort: {
    direction: "ASC" | "DESC";
    field: string;
  } | null;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

const normalizeStringFilter = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const assertKnownModel = (modelKey: string) => {
  const model = getDeliveryGraphqlModel(modelKey);
  if (!model) {
    throw new Error(`Unknown delivery GraphQL model: ${modelKey}`);
  }
  return model;
};

const normalizeSortDirection = (
  value: DeliveryGraphqlQuerySortInput["direction"],
): "ASC" | "DESC" => (value === "desc" || value === "DESC" ? "DESC" : "ASC");

export const buildDeliveryGraphqlListQueryInput = (input: {
  filter?: Record<string, unknown> | null;
  modelKey: string;
  pagination?: DeliveryGraphqlQueryPaginationInput | null;
  perspective?: DeliveryPerspective;
  previewToken?: string | null;
  sort?: DeliveryGraphqlQuerySortInput | null;
}): DeliveryGraphqlQueryInput => {
  const model = assertKnownModel(input.modelKey);
  const allowedFilterFields = new Set(model.filterInput.fields);
  const allowedSortFields = new Set(model.sortInput.fields);
  const filterEntries = Object.entries(input.filter ?? {}).flatMap(([key, value]) => {
    if (!allowedFilterFields.has(key)) {
      throw new Error(`Unknown delivery GraphQL filter field for ${input.modelKey}: ${key}`);
    }
    const normalized = normalizeStringFilter(value);
    return normalized === null ? [] : [[key, normalized] as const];
  });
  const sort =
    input.sort === null || input.sort === undefined
      ? null
      : {
          direction: normalizeSortDirection(input.sort.direction),
          field: input.sort.field,
        };
  if (sort && !allowedSortFields.has(sort.field)) {
    throw new Error(`Unknown delivery GraphQL sort field for ${input.modelKey}: ${sort.field}`);
  }

  return {
    filter: filterEntries.length > 0 ? Object.fromEntries(filterEntries) : null,
    limit: Math.max(0, input.pagination?.limit ?? DEFAULT_LIMIT),
    offset: Math.max(0, input.pagination?.offset ?? DEFAULT_OFFSET),
    perspective: toGraphqlPerspective(input.perspective ?? "published"),
    previewToken: input.previewToken ?? null,
    sort,
  };
};
