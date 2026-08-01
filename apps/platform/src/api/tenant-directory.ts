import {
  platformArchiveWorkspace,
  platformDisableWorkspace,
  platformEnableWorkspace,
  platformGetProjectDetail,
  platformGetUserDetail,
  platformGetWorkspaceDetail,
  platformListProjects,
  platformListUsers,
  platformListWorkspaces,
  platformRestoreWorkspace,
  platformUpdateWorkspace,
  type AccessRestrictionEnforceRequest,
  type AccessRestrictionLiftRequest,
  type DirectoryProjectDetailOut,
  type DirectoryUserDetailOut,
  type DirectoryWorkspaceDetailOut,
  type DirectoryWorkspaceUpdateRequest,
  type PageDataDirectoryProjectListItemOut,
  type PageDataDirectoryUserListItemOut,
  type PageDataDirectoryWorkspaceListItemOut,
  type PlatformListProjectsData,
  type PlatformListUsersData,
  type PlatformListWorkspacesData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class TenantDirectoryApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "TenantDirectoryApiError";
    this.code = code;
    this.status = status;
  }
}

function errorCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return errorCode(candidate.error) ?? errorCode(candidate.code) ?? errorCode(candidate.message);
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new TenantDirectoryApiError(
      errorCode(result.error) ?? "TENANT_DIRECTORY_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || !result.data.data) {
    throw new TenantDirectoryApiError(
      result.data?.error ?? "TENANT_DIRECTORY_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return result.data.data;
}

function normalizeError(error: unknown): TenantDirectoryApiError {
  if (error instanceof TenantDirectoryApiError) return error;
  return new TenantDirectoryApiError(
    error instanceof TypeError
      ? "TENANT_DIRECTORY_NETWORK_ERROR"
      : "TENANT_DIRECTORY_REQUEST_FAILED",
  );
}

export async function listTenantWorkspaces(
  query: NonNullable<PlatformListWorkspacesData["query"]>,
): Promise<PageDataDirectoryWorkspaceListItemOut> {
  try {
    return unwrap(await platformListWorkspaces({ client: platformApiClient, query }));
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function listTenantUsers(
  query: NonNullable<PlatformListUsersData["query"]>,
): Promise<PageDataDirectoryUserListItemOut> {
  try {
    return unwrap(await platformListUsers({ client: platformApiClient, query }));
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function listTenantProjects(
  query: NonNullable<PlatformListProjectsData["query"]>,
): Promise<PageDataDirectoryProjectListItemOut> {
  try {
    return unwrap(await platformListProjects({ client: platformApiClient, query }));
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function getTenantWorkspace(
  workspaceId: string,
): Promise<DirectoryWorkspaceDetailOut> {
  try {
    return unwrap(
      await platformGetWorkspaceDetail({
        client: platformApiClient,
        path: { workspace_id: workspaceId },
      }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function updateTenantWorkspace(
  workspaceId: string,
  body: DirectoryWorkspaceUpdateRequest,
): Promise<DirectoryWorkspaceDetailOut> {
  try {
    return unwrap(
      await platformUpdateWorkspace({
        client: platformApiClient,
        path: { workspace_id: workspaceId },
        body,
      }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function disableTenantWorkspace(
  workspaceId: string,
  body: AccessRestrictionEnforceRequest,
  idempotencyKey: string,
): Promise<DirectoryWorkspaceDetailOut> {
  try {
    return unwrap(
      await platformDisableWorkspace({
        client: platformApiClient,
        path: { workspace_id: workspaceId },
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function enableTenantWorkspace(
  workspaceId: string,
  body: AccessRestrictionLiftRequest,
  idempotencyKey: string,
): Promise<DirectoryWorkspaceDetailOut> {
  try {
    return unwrap(
      await platformEnableWorkspace({
        client: platformApiClient,
        path: { workspace_id: workspaceId },
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function archiveTenantWorkspace(
  workspaceId: string,
  body: AccessRestrictionEnforceRequest,
  idempotencyKey: string,
): Promise<DirectoryWorkspaceDetailOut> {
  try {
    return unwrap(
      await platformArchiveWorkspace({
        client: platformApiClient,
        path: { workspace_id: workspaceId },
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function restoreTenantWorkspace(
  workspaceId: string,
  body: AccessRestrictionLiftRequest,
  idempotencyKey: string,
): Promise<DirectoryWorkspaceDetailOut> {
  try {
    return unwrap(
      await platformRestoreWorkspace({
        client: platformApiClient,
        path: { workspace_id: workspaceId },
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function getTenantUser(userId: string): Promise<DirectoryUserDetailOut> {
  try {
    return unwrap(
      await platformGetUserDetail({ client: platformApiClient, path: { user_id: userId } }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function getTenantProject(projectId: string): Promise<DirectoryProjectDetailOut> {
  try {
    return unwrap(
      await platformGetProjectDetail({
        client: platformApiClient,
        path: { project_id: projectId },
      }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}
