import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function resolveRedirectTarget(explicitRedirect?: string) {
  if (explicitRedirect) return explicitRedirect;
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function useSecurityRelogin(redirect?: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((state) => state.clear);
  const clearWorkspace = useWorkspaceStore((state) => state.clearWorkspace);

  return useCallback(async () => {
    const target = resolveRedirectTarget(redirect);
    await queryClient.cancelQueries();
    queryClient.clear();
    clearAuth();
    clearWorkspace();
    await navigate({
      to: "/login",
      search: { redirect: target },
      replace: true,
    });
  }, [clearAuth, clearWorkspace, navigate, queryClient, redirect]);
}
