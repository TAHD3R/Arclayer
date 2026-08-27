import {
  platformDisableSystemPlugin,
  platformEnableSystemPlugin,
  platformGetSystemPluginDetail,
  platformGetSystemPluginOperation,
  platformInstallSystemPlugin,
  platformListExtensionConnections,
  platformListInstalledExtensions,
  platformListSystemPluginCatalog,
  platformListSystemPluginOperations,
  platformRecoverSystemPlugin,
  platformReviewManualPluginArtifact,
  platformRollbackSystemPlugin,
  platformUninstallSystemPlugin,
  platformUpgradeSystemPlugin,
  type ExtensionConnectionListOut,
  type PlatformListSystemPluginCatalogData,
  type PlatformListSystemPluginOperationsData,
  type PageDataSystemPluginOperationOut,
  type SystemPluginArtifactReviewOut,
  type SystemPluginCatalogListOut,
  type SystemPluginDetailOut,
  type SystemPluginInstallationCreateRequest,
  type SystemPluginLifecycleRequest,
  type SystemPluginOperationOut,
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

export function listInstalledExtensions(): Promise<SystemPluginCatalogListOut> {
  return platformListInstalledExtensions({ client: platformApiClient }).then(unwrap);
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

export function getExtension(pluginId: string): Promise<SystemPluginDetailOut> {
  return platformGetSystemPluginDetail({
    client: platformApiClient,
    path: { plugin_id: pluginId },
  }).then(unwrap);
}

export function getExtensionOperation(operationId: string): Promise<SystemPluginOperationOut> {
  return platformGetSystemPluginOperation({
    client: platformApiClient,
    path: { operation_id: operationId },
  }).then(unwrap);
}

export function installExtension(
  body: SystemPluginInstallationCreateRequest,
  idempotencyKey: string,
): Promise<SystemPluginOperationOut> {
  return platformInstallSystemPlugin({
    client: platformApiClient,
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function enableExtension(
  pluginId: string,
  body: SystemPluginLifecycleRequest,
  idempotencyKey: string,
) {
  return platformEnableSystemPlugin({
    client: platformApiClient,
    path: { plugin_id: pluginId },
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function disableExtension(
  pluginId: string,
  body: SystemPluginLifecycleRequest,
  idempotencyKey: string,
) {
  return platformDisableSystemPlugin({
    client: platformApiClient,
    path: { plugin_id: pluginId },
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function recoverExtension(
  pluginId: string,
  body: SystemPluginLifecycleRequest,
  idempotencyKey: string,
) {
  return platformRecoverSystemPlugin({
    client: platformApiClient,
    path: { plugin_id: pluginId },
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function rollbackExtension(
  pluginId: string,
  body: SystemPluginLifecycleRequest,
  idempotencyKey: string,
) {
  return platformRollbackSystemPlugin({
    client: platformApiClient,
    path: { plugin_id: pluginId },
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function upgradeExtension(
  pluginId: string,
  body: SystemPluginLifecycleRequest,
  idempotencyKey: string,
) {
  return platformUpgradeSystemPlugin({
    client: platformApiClient,
    path: { plugin_id: pluginId },
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function removeExtension(
  pluginId: string,
  body: SystemPluginLifecycleRequest,
  idempotencyKey: string,
) {
  return platformUninstallSystemPlugin({
    client: platformApiClient,
    path: { plugin_id: pluginId },
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function reviewManualArtifact(
  file: File,
  detachedSignature: string,
): Promise<SystemPluginArtifactReviewOut> {
  return platformReviewManualPluginArtifact({
    client: platformApiClient,
    body: { package: file, detached_signature: detachedSignature },
  }).then(unwrap);
}
