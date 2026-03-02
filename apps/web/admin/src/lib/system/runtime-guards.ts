import { notFound } from "@tanstack/react-router";

import { getSystemRuntime } from "@/api/system";
import { queryClient } from "@/lib/query/query-client-instance";
import type { DeploymentMode, DeploymentScope, SystemRuntime } from "@/types/api/system";

const FALLBACK_RUNTIME: SystemRuntime = {
  deploymentMode: "saas",
  capabilities: { deploymentSettingsEnabled: false, publicRegisterEnabled: false },
  systemFlags: {
    deploymentMode: "saas",
    multiTenant: true,
    customDomain: true,
    visualEditor: true,
    deploymentSettings: false,
    publicRegister: false,
  },
};

export async function ensureSystemRuntime(): Promise<SystemRuntime> {
  try {
    return await queryClient.ensureQueryData({
      queryKey: ["system", "runtime"],
      queryFn: async () => getSystemRuntime(),
      staleTime: 10 * 60 * 1000,
    });
  } catch {
    return FALLBACK_RUNTIME;
  }
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
