import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { notifyError } from "@/utils/notifications";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.silent) return;
        notifyError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.silent) return;
        notifyError(error);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Only retry when user explicitly clicks "Retry" in the UI.
        retry: false,
        retryOnMount: false,
        refetchOnReconnect: false,
      },
    },
  });
}
