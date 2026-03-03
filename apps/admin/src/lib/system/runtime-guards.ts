import { notFound } from "@tanstack/react-router";

import { getSystemRuntime } from "@/api/system";
import { queryClient } from "@/lib/query/query-client-instance";
import type { DeploymentMode, DeploymentScope, SystemRuntime } from "@/types/api/system";

const SYSTEM_RUNTIME_STALE_TIME_MS = 10 * 60 * 1000;

export async function ensureSystemRuntime(): Promise<SystemRuntime> {
  return await queryClient.ensureQueryData({
    queryKey: ["system", "runtime"],
    queryFn: async () => getSystemRuntime(),
    staleTime: SYSTEM_RUNTIME_STALE_TIME_MS,
  });
}

export async function requireDeploymentScope(scope: DeploymentScope): Promise<void> {
  if (scope === "both") return;

  const runtime = await ensureSystemRuntime();
  const mode: DeploymentMode = runtime.deploymentMode;

  if (scope !== mode) {
    throw notFound();
  }
}

export async function requireDeploymentSettingsEnabled(): Promise<void> {
  const runtime = await ensureSystemRuntime();
  const enabled =
    runtime.deploymentMode === "self_host" &&
    Boolean(runtime.capabilities.deploymentSettingsEnabled);

  if (!enabled) {
    throw notFound();
  }
}
