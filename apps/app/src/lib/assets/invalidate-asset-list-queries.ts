import type { QueryClient } from "@tanstack/react-query";

export function invalidateAssetListQueries(
  queryClient: QueryClient,
  scopeKey?: string | null,
): Promise<unknown[]> {
  const scoped = (segment: "list" | "paged" | "folderHasMatch" | "globalAssetCount") =>
    scopeKey ? ["assets", segment, scopeKey] : ["assets", segment];

  return Promise.all([
    queryClient.invalidateQueries({ queryKey: scoped("list") }),
    queryClient.invalidateQueries({ queryKey: scoped("paged") }),
    queryClient.invalidateQueries({ queryKey: scoped("folderHasMatch") }),
    queryClient.invalidateQueries({ queryKey: scoped("globalAssetCount") }),
  ]);
}
