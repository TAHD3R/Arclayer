import {
  platformListExtensionConnections,
  platformListSystemPluginCatalog,
  platformListSystemPluginOperations,
  platformListSystemPlugins,
  type ExtensionConnectionListOut,
  type PlatformListSystemPluginCatalogData,
  type PlatformListSystemPluginOperationsData,
  type PageDataSystemPluginOperationOut,
  type SystemPluginCatalogListOut,
  type SystemPluginListOut,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown }>;

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined || !result.data || result.data.error || result.data.data == null) {
    throw new Error(result.data?.error ?? "PLATFORM_EXTENSIONS_REQUEST_FAILED");
  }
  return result.data.data;
}

export function listInstalledExtensions(): Promise<SystemPluginListOut> {
  return platformListSystemPlugins({ client: platformApiClient }).then(unwrap);
}

export function listExtensionConnections(): Promise<ExtensionConnectionListOut> {
  return platformListExtensionConnections({ client: platformApiClient }).then(unwrap);
}

export function listExtensionCatalog(
  query?: NonNullable<PlatformListSystemPluginCatalogData["query"]>,
): Promise<SystemPluginCatalogListOut> {
  return platformListSystemPluginCatalog({ client: platformApiClient, query }).then(unwrap);
}

export function listExtensionOperations(
  query?: NonNullable<PlatformListSystemPluginOperationsData["query"]>,
): Promise<PageDataSystemPluginOperationOut> {
  return platformListSystemPluginOperations({ client: platformApiClient, query }).then(unwrap);
}
