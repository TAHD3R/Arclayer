export interface DeliveryApiErrorInit {
  body?: unknown;
  code: string;
  details?: unknown;
  message: string;
  meta?: Record<string, unknown> | null;
  requestId?: string | null;
  status: number;
}

export class DeliveryApiError extends Error {
  readonly body: unknown;
  readonly code: string;
  readonly details: unknown;
  readonly meta: Record<string, unknown> | null;
  readonly requestId: string | null;
  readonly status: number;

  constructor(init: DeliveryApiErrorInit) {
    super(init.message);
    this.name = "DeliveryApiError";
    this.body = init.body;
    this.code = init.code;
    this.details = init.details;
    this.meta = init.meta ?? null;
    this.requestId = init.requestId ?? null;
    this.status = init.status;
  }
}

export interface DeliveryGraphQLErrorInit {
  errors: Array<{
    extensions?: Record<string, unknown>;
    message: string;
    path?: Array<number | string>;
  }>;
  requestId?: string | null;
  status: number;
}

export class DeliveryGraphQLError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly errors: DeliveryGraphQLErrorInit["errors"];
  readonly meta: Record<string, unknown> | null;
  readonly requestId: string | null;
  readonly status: number;

  constructor(init: DeliveryGraphQLErrorInit) {
    const primary = init.errors[0];
    const extensions =
      primary?.extensions && typeof primary.extensions === "object" ? primary.extensions : null;
    const details =
      extensions && "details" in extensions
        ? (extensions as Record<string, unknown>).details
        : undefined;
    const meta =
      extensions && "meta" in extensions && typeof extensions.meta === "object"
        ? (extensions.meta as Record<string, unknown>)
        : null;

    super(primary?.message || "GraphQL request failed");
    this.name = "DeliveryGraphQLError";
    this.errors = init.errors;
    this.code =
      (typeof extensions?.code === "string" && extensions.code) ||
      (typeof extensions?.statusCode === "string" && extensions.statusCode) ||
      "GRAPHQL_REQUEST_FAILED";
    this.details = details;
    this.meta = meta;
    this.requestId = init.requestId ?? null;
    this.status = init.status;
  }
}

export const isDeliveryApiError = (value: unknown): value is DeliveryApiError =>
  value instanceof DeliveryApiError;

export const isDeliveryGraphQLError = (value: unknown): value is DeliveryGraphQLError =>
  value instanceof DeliveryGraphQLError;
