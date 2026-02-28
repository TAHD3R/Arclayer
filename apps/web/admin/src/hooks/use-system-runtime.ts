import { useQuery } from "@tanstack/react-query";

import { getSystemRuntime } from "@/api/system";
import type { SystemRuntime } from "@/types/api";

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

export function useSystemRuntime() {
  const query = useQuery({
    queryKey: ["system", "runtime"],
    queryFn: async () => getSystemRuntime(),
    staleTime: 10 * 60 * 1000,
    retry: 1,
    meta: { silent: true },
  });

  // Safe default: when runtime probe fails, treat as SaaS and hide deployment settings.
  const safeRuntime = query.isSuccess ? query.data : FALLBACK_RUNTIME;

  return {
    ...query,
    runtime: safeRuntime,
    systemFlags: safeRuntime.systemFlags,
    flags: safeRuntime.systemFlags,
    deploymentSettingsEnabled: Boolean(
      safeRuntime.deploymentMode === "self_host" &&
      safeRuntime.capabilities.deploymentSettingsEnabled,
    ),
    publicRegisterEnabled: Boolean(safeRuntime.capabilities.publicRegisterEnabled),
  } as const;
}
