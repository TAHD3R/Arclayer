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
  readonly errors: DeliveryGraphQLErrorInit["errors"];
  readonly requestId: string | null;
  readonly status: number;

  constructor(init: DeliveryGraphQLErrorInit) {
    super(init.errors[0]?.message || "GraphQL request failed");
    this.name = "DeliveryGraphQLError";
    this.errors = init.errors;
    this.requestId = init.requestId ?? null;
    this.status = init.status;
  }
}

export const isDeliveryApiError = (value: unknown): value is DeliveryApiError =>
  value instanceof DeliveryApiError;

export const isDeliveryGraphQLError = (value: unknown): value is DeliveryGraphQLError =>
  value instanceof DeliveryGraphQLError;
