import { api } from "@/lib/http";
import type { SystemBootstrapPayload, SystemRuntime, TokenPair } from "@/types/api";

/**
 * Public runtime probe endpoint.
 *
 * Notes:
 * - No auth required, but we still send tokens when available (harmless).
 * - If the request fails, callers should treat optional capabilities as unavailable.
 */
export async function getSystemRuntime(): Promise<SystemRuntime> {
  return api.get<SystemRuntime>("/system/runtime", { auth: { skipRefresh: true } });
}

export async function bootstrapInstance(payload: SystemBootstrapPayload): Promise<TokenPair> {
  return api.post<TokenPair>("/system/setup/bootstrap", payload, { auth: { skipRefresh: true } });
}
