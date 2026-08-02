import { useQuery } from "@tanstack/react-query";

import { getProductRuntime } from "@/api/product-runtime";

const PRODUCT_RUNTIME_STALE_TIME_MS = 10 * 60 * 1000;

export function useProductRuntime() {
  const query = useQuery({
    queryKey: ["product", "runtime"],
    queryFn: async () => getProductRuntime(),
    staleTime: PRODUCT_RUNTIME_STALE_TIME_MS,
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
    publicRegisterEnabled: runtime ? Boolean(runtime.capabilities.publicRegisterEnabled) : null,
  } as const;
}
