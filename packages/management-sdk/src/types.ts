import type { ApiClient } from "@arclayer/openapi";

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

export interface PagePayload<T> {
  items?: T[];
  next?: number | null;
  page: number;
  pages: number;
  prev?: number | null;
  size: number;
  total: number;
}

export interface ApiPage<T> extends ApiRequestMetadata {
  items: T[];
  next: number | null;
  page: number;
  pages: number;
  prev: number | null;
  raw: PagePayload<T>;
  size: number;
  total: number;
}

export interface ManagementSdkOptions {
  baseUrl: string;
  token?: string | (() => MaybePromise<string | null | undefined>);
  headers?: HeadersInit;
  fetch?: typeof fetch;
}

export type ManagementRequestMetadata = ApiRequestMetadata;

export type ManagementResult<T> = ApiResult<T>;

export type ManagementPage<T> = ApiPage<T>;

export type ManagementRawClient = ApiClient;
