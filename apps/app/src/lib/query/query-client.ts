import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { notifyError } from "@/lib/notifications";

function hasOnErrorHandler(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;

  const options = Reflect.get(target, "options");
  if (!options || typeof options !== "object") return false;

  return typeof Reflect.get(options, "onError") === "function";
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.silent) return;
        // If the query already defines its own onError handler, assume it owns the UX (toast/UI),
        // and avoid double toasts triggered by the global cache handler.
        if (hasOnErrorHandler(query)) return;
        notifyError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.silent) return;
        // Same as queries: avoid double toasts when a mutation already handles errors locally.
        if (hasOnErrorHandler(mutation)) return;
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
