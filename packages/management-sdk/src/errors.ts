export interface ManagementApiErrorInit {
  body?: unknown;
  code: string;
  details?: unknown;
  message: string;
  meta?: Record<string, unknown> | null;
  requestId?: string | null;
  status: number;
}

export class ManagementApiError extends Error {
  readonly body: unknown;
  readonly code: string;
  readonly details: unknown;
  readonly meta: Record<string, unknown> | null;
  readonly requestId: string | null;
  readonly status: number;

  constructor(init: ManagementApiErrorInit) {
    super(init.message);
    this.name = "ManagementApiError";
    this.body = init.body;
    this.code = init.code;
    this.details = init.details;
    this.meta = init.meta ?? null;
    this.requestId = init.requestId ?? null;
    this.status = init.status;
  }
}

export const isManagementApiError = (value: unknown): value is ManagementApiError =>
  value instanceof ManagementApiError;
