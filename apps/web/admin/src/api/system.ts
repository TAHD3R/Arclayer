import { api } from "@/lib/http";

export type SetupAccessMode = "local_only" | "token";

export interface SystemSetupStatus {
  initialized: boolean;
  masterKeyReady: boolean;
  repairRequired: boolean;
  repairHint?: string | null;
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
  organization?:
    | {
        name: string;
        slug?: string | null;
        logo_url?: string | null;
      }
    | null;
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

export type SystemSetupJobStatus = "pending" | "running" | "succeeded" | "failed";
export type SystemSetupJobStage = "precheck" | "admin" | "provision" | "workspace" | "finalize";

export interface SystemSetupJob {
  jobId: string;
  status: SystemSetupJobStatus;
  stage: SystemSetupJobStage;
  percent: number;
  createdAt: string;
}

export interface SystemSetupJobStatusPayload extends SystemSetupJob {
  startedAt?: string | null;
  finishedAt?: string | null;
  warnings: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
  result?: SystemSetupResult | null;
}

export async function setupSystem(
  payload: SystemSetupRequest,
  opts?: { setupToken?: string; devSetup?: boolean },
): Promise<SystemSetupJob> {
  const headers = opts?.setupToken ? { "X-Setup-Token": opts.setupToken } : undefined;
  const query = opts?.devSetup ? "?__dev_setup=1" : "";
  return api.post<SystemSetupJob>(`/system/setup${query}`, payload, {
    headers,
    auth: { skipRefresh: true },
  });
}

export async function getSetupJobStatus(
  jobId: string,
  opts?: { setupToken?: string },
): Promise<SystemSetupJobStatusPayload> {
  const headers = opts?.setupToken ? { "X-Setup-Token": opts.setupToken } : undefined;
  return api.get<SystemSetupJobStatusPayload>(`/system/setup/jobs/${jobId}`, {
    headers,
    auth: { skipRefresh: true },
  });
}

export async function repairSetupMasterKey(input: {
  confirmText: string;
}): Promise<{ masterKeyReady: boolean; created: boolean; masterKeyFingerprint: string }> {
  return api.post<{ masterKeyReady: boolean; created: boolean; masterKeyFingerprint: string }>(
    "/system/setup/master-key/repair",
    {
      confirmText: input.confirmText,
    },
  );
}

export async function reinitializeSelfHostSystem(input: {
  confirmName: string;
}): Promise<{ reinitialized: boolean; setupRequired: boolean }> {
  return api.post<{ reinitialized: boolean; setupRequired: boolean }>("/system/setup/reinitialize", {
    confirmName: input.confirmName,
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
