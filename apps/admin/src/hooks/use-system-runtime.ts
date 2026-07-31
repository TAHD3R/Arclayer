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

  return {
    ...query,
    runtime,
    deploymentSettingsEnabled: runtime
      ? Boolean(runtime.capabilities.deploymentSettingsEnabled)
      : null,
    publicRegisterEnabled: runtime ? Boolean(runtime.capabilities.publicRegisterEnabled) : null,
  } as const;
}
