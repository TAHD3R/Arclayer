import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getCoreSettings } from "@/api/settings";
import {
  DEFAULT_WORKSPACE_CONTENT_STRATEGY,
  readWorkspaceContentStrategy,
  type WorkspaceContentStrategyPolicy,
} from "@/lib/settings/workspace/content-strategy";

export function useWorkspaceContentStrategy(workspaceId: string): {
  policy: WorkspaceContentStrategyPolicy;
  isLoading: boolean;
  error: unknown;
} {
  const query = useQuery({
    queryKey: ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getCoreSettings(workspaceId),
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const policy = useMemo(() => {
    if (!query.data) return DEFAULT_WORKSPACE_CONTENT_STRATEGY;
    return readWorkspaceContentStrategy(query.data.value);
  }, [query.data]);

  return {
    policy,
    isLoading: query.isLoading,
    error: query.error,
  };
}
