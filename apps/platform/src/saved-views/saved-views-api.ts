import {
  platformCreateSavedView,
  platformDeleteSavedView,
  platformGetSavedView,
  platformListSavedViews,
  platformUpdateSavedView,
  type PlatformSavedViewCreateCommand,
  type PlatformSavedViewOut,
  type PlatformSavedViewReadOut,
  type PlatformSavedViewUpdateCommand,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class SavedViewsApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "SavedViewsApiError";
    this.status = status;
  }
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new SavedViewsApiError(
      result.data?.error ?? "PLATFORM_SAVED_VIEW_REQUEST_FAILED",
      result.response?.status,
    );
  }
  return result.data.data;
}

export async function listSavedViews(capabilityId: string): Promise<PlatformSavedViewReadOut[]> {
  return unwrap(
    await platformListSavedViews({
      client: platformApiClient,
      path: { capability_id: capabilityId },
    }),
  );
}

export async function getSavedView(viewId: string): Promise<PlatformSavedViewReadOut> {
  return unwrap(
    await platformGetSavedView({ client: platformApiClient, path: { view_id: viewId } }),
  );
}

export async function createSavedView(
  capabilityId: string,
  command: PlatformSavedViewCreateCommand,
): Promise<PlatformSavedViewOut> {
  return unwrap(
    await platformCreateSavedView({
      client: platformApiClient,
      path: { capability_id: capabilityId },
      body: command,
    }),
  );
}

export async function updateSavedView(
  viewId: string,
  command: PlatformSavedViewUpdateCommand,
): Promise<PlatformSavedViewOut> {
  return unwrap(
    await platformUpdateSavedView({
      client: platformApiClient,
      path: { view_id: viewId },
      body: command,
    }),
  );
}

export async function deleteSavedView(viewId: string, expectedRevision: number): Promise<void> {
  const result = await platformDeleteSavedView({
    client: platformApiClient,
    path: { view_id: viewId },
    body: { expectedRevision },
  });
  if (result.error !== undefined || result.data?.error) {
    throw new SavedViewsApiError(
      result.data?.error ?? "PLATFORM_SAVED_VIEW_REQUEST_FAILED",
      result.response?.status,
    );
  }
}
