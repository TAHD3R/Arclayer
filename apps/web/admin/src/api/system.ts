import { api } from "@/lib/http";

export type SetupAccessMode = "local_only" | "token";

export interface SystemSetupStatus {
  initialized: boolean;
  setupEnabled: boolean;
  access: SetupAccessMode;
}

export async function getSetupStatus(): Promise<SystemSetupStatus> {
  return api.get<SystemSetupStatus>("/system/setup/status", { auth: { skipRefresh: true } });
}

export interface SystemSetupRequest {
  admin: {
    username: string;
    password: string;
    email: string;
    display_name: string;
  };
  organization?: null;
  master_key?: string;
  core_patch: Record<string, unknown>;
}

export interface SystemSetupResult {
  initialized_at: string;
  master_key_fingerprint: string;
  admin_user_id: string;
  admin_username: string;
  rbac_bootstrapped: boolean;
  organization_id?: string | null;
  organization_slug?: string | null;
  organization_name?: string | null;
}

export async function setupSystem(
  payload: SystemSetupRequest,
  opts?: { setupToken?: string },
): Promise<SystemSetupResult> {
  const headers = opts?.setupToken ? { "X-Setup-Token": opts.setupToken } : undefined;
  return api.post<SystemSetupResult>("/system/setup", payload, {
    headers,
    auth: { skipRefresh: true },
  });
}

export type DeploymentMode = "saas" | "self_host";

export interface SystemRuntime {
  deploymentMode: DeploymentMode;
  capabilities: {
    deploymentSettingsEnabled: boolean;
    publicRegisterEnabled: boolean;
  };
}

/**
 * Public runtime probe endpoint.
 *
 * Notes:
 * - No auth required, but we still send tokens when available (harmless).
 * - If the request fails, callers should default to SaaS-safe behavior (hide deployment settings).
 */
export async function getSystemRuntime(): Promise<SystemRuntime> {
  return api.get<SystemRuntime>("/system/runtime", { auth: { skipRefresh: true } });
}
