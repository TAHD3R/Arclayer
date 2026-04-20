import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getWorkspaceDetail } from "@/api/workspaces";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { buildDocumentTitle } from "@/lib/admin-nav-utils";
import { getUsercenterOverlayTitleKey } from "@/pages/usercenter/shared/usercenter-overlay-registry";
import { useAuthStore } from "@/stores/use-auth-store";

function resolveTitleKey(staticData: unknown): string | null {
  if (!staticData || typeof staticData !== "object") return null;
  const value = (staticData as Record<string, unknown>).titleKey;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveWorkspaceId(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const value = (params as Record<string, unknown>).workspaceId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Global document.title manager.
 *
 * Source-of-truth:
 * - Every route registers `staticData.titleKey` in its route definition (createFileRoute).
 * - Title is resolved from the current route matches (leaf-first), not from nav/menu items.
 */
export function RouteDocumentTitleManager(): null {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const settingsScreen = useSettingsScreen();

  const matches = useRouterState({
    select: (s) => s.matches,
  });

  const titleKey = useMemo(() => {
    if (settingsScreen.state.open) return getUsercenterOverlayTitleKey(settingsScreen.state.screen);
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const key = resolveTitleKey(matches[i]?.staticData);
      if (key) return key;
    }
    return null;
  }, [matches, settingsScreen.state.open, settingsScreen.state.screen]);

  const workspaceId = useMemo(() => {
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const id = resolveWorkspaceId(matches[i]?.params);
      if (id) return id;
    }
    return null;
  }, [matches]);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () => getWorkspaceDetail(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceName = useMemo(() => {
    const raw = workspaceDetailQuery.data?.name;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }, [workspaceDetailQuery.data?.name]);

  const routeTitle = useMemo(() => {
    if (!titleKey) return null;
    const translated = t(titleKey);
    return typeof translated === "string" && translated.trim() ? translated.trim() : null;
  }, [t, titleKey]);

  useEffect(() => {
    document.title = buildDocumentTitle(routeTitle, workspaceName);
  }, [routeTitle, workspaceName]);

  return null;
}
