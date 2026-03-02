import { api } from "@/lib/http";
import type {
  SystemSetupStatus,
  SystemSetupRequest,
  SystemSetupJob,
  SystemSetupJobStatusPayload,
  SystemRuntime,
} from "@/types/api";

export async function getSetupStatus(): Promise<SystemSetupStatus> {
  return api.get<SystemSetupStatus>("/system/setup/status", { auth: { skipRefresh: true } });
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
  password: string;
}): Promise<{ masterKeyReady: boolean; created: boolean; masterKeyFingerprint: string }> {
  return api.post<{ masterKeyReady: boolean; created: boolean; masterKeyFingerprint: string }>(
    "/system/setup/master-key/repair",
    { confirmText: input.confirmText, password: input.password },
  );
}

export async function reinitializeSelfHostSystem(input: {
  confirmName: string;
}): Promise<{ reinitialized: boolean; setupRequired: boolean }> {
  return api.post<{ reinitialized: boolean; setupRequired: boolean }>(
    "/system/setup/reinitialize",
    { confirmName: input.confirmName },
  );
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
