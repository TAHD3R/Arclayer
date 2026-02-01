import { useQuery } from "@tanstack/react-query";

import { getCoreSettings } from "@/api/settings";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

export function useWorkspaceCoreSettings() {
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useQuery({
    queryKey: ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getCoreSettings(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
}
