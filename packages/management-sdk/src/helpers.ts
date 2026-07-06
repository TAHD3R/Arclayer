import type {
  ApiEnvelope,
  ManagementPage,
  ManagementResult,
  ManagementSdkOptions,
  PagePayload,
} from "./types";
import { ManagementApiError } from "./errors";

const TRACE_HEADER_NAME = "X-Trace-Id";

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const resolveToken = async (token: ManagementSdkOptions["token"]): Promise<string | null> => {
  if (typeof token === "function") {
    return (await token())?.trim() || null;
  }
  return token?.trim() || null;
};

export const createManagementHeaders = async (
  options: ManagementSdkOptions,
  extra?: HeadersInit,
): Promise<Record<string, string>> => {
  const headers = new Headers(options.headers);
  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const token = await resolveToken(options.token);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const readRequestId = (response: Response): string | null =>
  response.headers.get(TRACE_HEADER_NAME) ?? response.headers.get(TRACE_HEADER_NAME.toLowerCase());

const toEnvelope = <T>(value: unknown): ApiEnvelope<T> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as ApiEnvelope<T>;
};

const toError = <T>(input: {
  body: unknown;
  envelope: ApiEnvelope<T> | null;
  response: Response;
}): ManagementApiError => {
  const { body, envelope, response } = input;
  const meta = envelope?.meta ?? null;
  const details =
    meta && typeof meta === "object" && "details" in meta
      ? (meta as Record<string, unknown>).details
      : undefined;
  return new ManagementApiError({
    body,
    code: envelope?.error || response.statusText || "MANAGEMENT_REQUEST_FAILED",
    details,
    message: envelope?.message || response.statusText || "Management request failed",
    meta,
    requestId: readRequestId(response),
    status: response.status,
  });
};

export const normalizeManagementResult = <T>(
  response: Response,
  payload: unknown,
  options: { allowNullData?: boolean } = {},
): ManagementResult<T> => {
  const envelope = toEnvelope<T>(payload);
  if (!response.ok || envelope?.error) {
    throw toError({ body: envelope, envelope, response });
  }
  if (envelope?.data === undefined || (!options.allowNullData && envelope.data === null)) {
    throw toError({
      body: envelope,
      envelope: {
        ...envelope,
        error: "MANAGEMENT_RESPONSE_DATA_MISSING",
        message: envelope?.message || "Management response data missing",
      },
      response,
    });
  }

  return {
    data: envelope.data as T,
    message: envelope.message || "OK",
    meta: envelope.meta ?? null,
    requestId: readRequestId(response),
    status: response.status,
    timestamp: envelope.timestamp,
  };
};

export const normalizeManagementPage = <T>(
  response: Response,
  payload: unknown,
): ManagementPage<T> => {
  const result = normalizeManagementResult<PagePayload<T>>(response, payload);
  return {
    items: result.data.items ?? [],
    message: result.message,
    meta: result.meta,
    next: result.data.next ?? null,
    page: result.data.page,
    pages: result.data.pages,
    prev: result.data.prev ?? null,
    raw: result.data,
    requestId: result.requestId,
    size: result.data.size,
    status: result.status,
    timestamp: result.timestamp,
    total: result.data.total,
  };
};

export const normalizeManagementBaseUrl = normalizeBaseUrl;
