import { useQuery } from "@tanstack/react-query";

import { getSystemRuntime } from "@/api/system";

const SYSTEM_RUNTIME_STALE_TIME_MS = 10 * 60 * 1000;

export function useSystemRuntime() {
  const query = useQuery({
    queryKey: ["system", "runtime"],
    queryFn: async () => getSystemRuntime(),
    staleTime: SYSTEM_RUNTIME_STALE_TIME_MS,
    refetchOnMount: "always",
    retry: 1,
  });

  if (query.isError) {
    throw query.error;
  }

  const runtime = query.data ?? null;
  const systemFlags = runtime?.systemFlags ?? null;
  const deploymentMode = runtime?.deploymentMode ?? null;

  return {
    ...query,
    runtime,
    systemFlags,
    flags: systemFlags,
    deploymentMode,
    deploymentSettingsEnabled:
      runtime && runtime.deploymentMode === "self_host"
        ? Boolean(runtime.capabilities.deploymentSettingsEnabled)
        : null,
    publicRegisterEnabled: runtime ? Boolean(runtime.capabilities.publicRegisterEnabled) : null,
  } as const;
}
