export type MaybePromise<T> = T | Promise<T>;

export interface ApiEnvelope<T> {
  data?: T | null;
  error?: string | null;
  message?: string;
  meta?: Record<string, unknown> | null;
  timestamp?: number;
}

export interface PagePayload<T> {
  items?: T[];
  next?: number | null;
  page: number;
  pages: number;
  prev?: number | null;
  size: number;
  total: number;
}

export interface ManagementSdkOptions {
  baseUrl: string;
  token?: string | (() => MaybePromise<string | null | undefined>);
  headers?: HeadersInit;
  fetch?: typeof fetch;
}

export interface ManagementRequestMetadata {
  message: string;
  meta?: Record<string, unknown> | null;
  requestId: string | null;
  status: number;
  timestamp?: number;
}

export interface ManagementResult<T> extends ManagementRequestMetadata {
  data: T;
}

export interface ManagementPage<T> extends ManagementRequestMetadata {
  items: T[];
  next: number | null;
  page: number;
  pages: number;
  prev: number | null;
  raw: PagePayload<T>;
  size: number;
  total: number;
}
