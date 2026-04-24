import * as openapi from "@arclayer/openapi";

import type {
  ApiEnvelope,
  DeliveryGlobalSet,
  DeliveryMenu,
  DeliveryPageResolveOut,
  DeliveryRouteResolveOut,
  DeliveryResult,
  DeliveryRuntimeConfig,
  DeliverySdkOptions,
  DeliverySection,
  DeliveryStyle,
} from "./types";
import { DeliveryApiError } from "./errors";
import { createDeliveryHeaders, normalizeDeliveryBaseUrl, readDeliveryRequestId } from "./auth";

type OpenApiResponse<T> = {
  data?: ApiEnvelope<T>;
  error?: unknown;
  request: Request;
  response: Response;
};

type OpenApiOperation<T> = (options: Record<string, unknown>) => Promise<OpenApiResponse<T>>;

const toEnvelope = <T>(value: unknown): ApiEnvelope<T> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as ApiEnvelope<T>;
};

const normalizeRestResult = <T>(response: Response, payload: unknown): DeliveryResult<T> => {
  const envelope = toEnvelope<T>(payload);
  if (!response.ok || envelope?.error || envelope?.data === undefined || envelope.data === null) {
    const meta = envelope?.meta ?? null;
    throw new DeliveryApiError({
      body: payload,
      code: envelope?.error || response.statusText || "DELIVERY_REQUEST_FAILED",
      details: meta && typeof meta === "object" ? meta.details : undefined,
      message: envelope?.message || response.statusText || "Delivery request failed",
      meta,
      requestId: readDeliveryRequestId(response),
      status: response.status,
    });
  }

  return {
    data: envelope.data,
    message: envelope.message || "OK",
    meta: envelope.meta ?? null,
    requestId: readDeliveryRequestId(response),
    status: response.status,
    timestamp: envelope.timestamp,
  };
};

export class DeliveryRestClient {
  private readonly rawClient: openapi.ApiClient;

  constructor(private readonly options: DeliverySdkOptions) {
    this.rawClient = openapi.createApiClient({
      baseUrl: normalizeDeliveryBaseUrl(options.baseUrl),
      fetch: options.fetch,
    });
  }

  private async invoke<T>(
    operation: OpenApiOperation<T>,
    request: Record<string, unknown>,
  ): Promise<DeliveryResult<T>> {
    const headers = await createDeliveryHeaders(
      this.options,
      request.headers as HeadersInit | undefined,
    );
    const result = await operation({
      ...request,
      client: this.rawClient,
      headers,
      responseStyle: "fields",
    });
    return normalizeRestResult<T>(result.response, result.data ?? result.error);
  }

  async getMenu(input: {
    menuKey: string;
    runtimeId: string;
  }): Promise<DeliveryResult<DeliveryMenu>> {
    return this.invoke<DeliveryMenu>(
      openapi.externalRuntimesGetRuntimeDeliveryMenu as OpenApiOperation<DeliveryMenu>,
      {
        path: {
          menu_key: input.menuKey,
          runtime_id: input.runtimeId,
        },
      },
    );
  }

  async getStyle(input: { runtimeId: string }): Promise<DeliveryResult<DeliveryStyle>> {
    return this.invoke<DeliveryStyle>(
      openapi.externalRuntimesGetRuntimeDeliveryStyle as OpenApiOperation<DeliveryStyle>,
      {
        path: {
          runtime_id: input.runtimeId,
        },
      },
    );
  }

  async getRuntimeConfig(input: {
    locale?: string | null;
    mode?: "public" | "preview";
    previewToken?: string | null;
    runtimeId: string;
  }): Promise<DeliveryResult<DeliveryRuntimeConfig>> {
    return this.invoke<DeliveryRuntimeConfig>(
      openapi.externalRuntimesGetRuntimeConfig as OpenApiOperation<DeliveryRuntimeConfig>,
      {
        path: {
          runtime_id: input.runtimeId,
        },
        query: {
          locale: input.locale ?? null,
          mode: input.mode ?? "public",
          token: input.previewToken ?? null,
        },
      },
    );
  }

  async resolveRoute(input: {
    mode?: "public" | "preview";
    path: string;
    previewToken?: string | null;
    runtimeId: string;
  }): Promise<DeliveryResult<DeliveryRouteResolveOut>> {
    return this.invoke<DeliveryRouteResolveOut>(
      openapi.externalRuntimesResolveRuntimeRoute as OpenApiOperation<DeliveryRouteResolveOut>,
      {
        path: {
          runtime_id: input.runtimeId,
        },
        query: {
          mode: input.mode ?? "public",
          path: input.path,
          token: input.previewToken ?? null,
        },
      },
    );
  }

  async resolvePage(input: {
    path: string;
    perspective?: "published" | "preview";
    previewToken?: string | null;
    runtimeId: string;
  }): Promise<DeliveryResult<DeliveryPageResolveOut>> {
    const perspective = input.perspective ?? "published";
    return this.invoke<DeliveryPageResolveOut>(
      openapi.externalRuntimesResolveRuntimeDeliveryPage as OpenApiOperation<DeliveryPageResolveOut>,
      {
        path: {
          runtime_id: input.runtimeId,
        },
        query: {
          path: input.path,
          perspective,
          token: input.previewToken ?? null,
        },
      },
    );
  }

  async getPageById(input: {
    pageId: string;
    perspective?: "published" | "preview";
    previewToken?: string | null;
    runtimeId: string;
  }): Promise<DeliveryResult<DeliveryPageResolveOut>> {
    const perspective = input.perspective ?? "published";
    return this.invoke<DeliveryPageResolveOut>(
      openapi.externalRuntimesGetRuntimeDeliveryPageById as OpenApiOperation<DeliveryPageResolveOut>,
      {
        path: {
          page_id: input.pageId,
          runtime_id: input.runtimeId,
        },
        query: {
          perspective,
          token: input.previewToken ?? null,
        },
      },
    );
  }

  async getSectionByAlias(input: {
    alias: string;
    perspective?: "published" | "preview";
    previewToken?: string | null;
    runtimeId: string;
  }): Promise<DeliveryResult<DeliverySection>> {
    const perspective = input.perspective ?? "published";
    return this.invoke<DeliverySection>(
      openapi.externalRuntimesGetRuntimeDeliverySectionByAlias as OpenApiOperation<DeliverySection>,
      {
        path: {
          alias: input.alias,
          runtime_id: input.runtimeId,
        },
        query: {
          perspective,
          token: input.previewToken ?? null,
        },
      },
    );
  }

  async resolveGlobalSet(input: {
    key: string;
    perspective?: "published" | "preview";
    previewToken?: string | null;
    runtimeId: string;
  }): Promise<DeliveryResult<DeliveryGlobalSet>> {
    const perspective = input.perspective ?? "published";
    return this.invoke<DeliveryGlobalSet>(
      openapi.externalRuntimesResolveRuntimeDeliveryGlobalSet as OpenApiOperation<DeliveryGlobalSet>,
      {
        path: {
          key: input.key,
          runtime_id: input.runtimeId,
        },
        query: {
          perspective,
          token: input.previewToken ?? null,
        },
      },
    );
  }
}
