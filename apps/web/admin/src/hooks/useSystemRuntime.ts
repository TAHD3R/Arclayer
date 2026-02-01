import { useQuery } from "@tanstack/react-query";

import { getSystemRuntime, type SystemRuntime } from "@/api/system";

const FALLBACK_RUNTIME: SystemRuntime = {
  deploymentMode: "saas",
  capabilities: { deploymentSettingsEnabled: false },
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
    deploymentSettingsEnabled: Boolean(
      safeRuntime.deploymentMode === "self_host" &&
      safeRuntime.capabilities.deploymentSettingsEnabled,
    ),
  } as const;
}
