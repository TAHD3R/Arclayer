import { api } from "@/lib/http";
import type { SystemRuntime } from "@/types/api";

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
