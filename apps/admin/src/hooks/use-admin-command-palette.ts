import { useEffect, useMemo, useState } from "react";
import { Bell, SlidersHorizontal, UserRound, Workflow } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { listAssets } from "@/api/assets";
import { listTeamMembers } from "@/api/team";
import type { CommandEntry, CommandScope, CommandSection } from "@/lib/command/command-types";
import {
  formatAssetBytes,
  formatAssetCommandTitle,
  buildNotificationsPath,
  matchesCommandEntry,
  resolveRecentCommandEntries,
} from "@/lib/command/entry-utils";
import { buildAdminNavCommandEntries } from "@/lib/command/nav-command-items";
import { resolveCommandSections, type CommandSource } from "@/lib/command/source-registry";
import {
  buildUsercenterOverlayNavigate,
  resolveUsercenterOverlayTabFromPath,
} from "@/lib/routing/usercenter-overlay";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { useCommandRecentStore } from "@/stores/use-command-recent-store";
import type { AdminNavItem } from "@/types/admin-nav";

function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function buildActionEntries(params: {
  scope: CommandScope;
  t: (key: string) => string;
}): CommandEntry[] {
  const { scope, t } = params;
  const actions: CommandEntry[] = [
    {
      id: "action:profile",
      key: "action:profile",
      kind: "action",
      title: t("account:ME_TAB_PROFILE"),
      subtitle: t("command:COMMAND_ACTION_PROFILE_DESC"),
      keywords: [t("account:ME_TAB_PROFILE"), t("account:ME_TITLE")],
      icon: UserRound,
      shortcut: ["G", "P"],
      action: { type: "navigate", to: "/settings/personal/profile" },
    },
    {
      id: "action:preferences",
      key: "action:preferences",
      kind: "action",
      title: t("account:ME_TAB_PREFERENCES"),
      subtitle: t("command:COMMAND_ACTION_PREFERENCES_DESC"),
      keywords: [t("account:ME_TAB_PREFERENCES"), t("account:ME_TITLE")],
      icon: SlidersHorizontal,
      shortcut: ["G", ","],
      action: { type: "navigate", to: "/settings/personal/preferences" },
    },
    {
      id: "action:notifications",
      key: "action:notifications",
      kind: "action",
      title: t("notifications:NOTIFICATIONS_PAGE_TITLE"),
      subtitle: t("command:COMMAND_ACTION_NOTIFICATIONS_DESC"),
      keywords: [t("notifications:NOTIFICATIONS_PAGE_TITLE"), t("account:ME_TAB_NOTIFICATIONS")],
      icon: Bell,
      shortcut: ["G", "N"],
      action: {
        type: "navigate",
        to: buildNotificationsPath(scope.workspaceId),
      },
    },
  ];

  if (scope.workspaceId) {
    actions.unshift({
      id: "action:workspace-switcher",
      key: "action:workspace-switcher",
      kind: "action",
      title: t("command:COMMAND_ACTION_SWITCH_WORKSPACE"),
      subtitle: t("command:COMMAND_ACTION_SWITCH_WORKSPACE_DESC"),
      keywords: [t("command:COMMAND_ACTION_SWITCH_WORKSPACE"), "workspace"],
      icon: Workflow,
      shortcut: ["G", "W"],
      action: {
        type: "navigate",
        to: "/workspaces",
      },
    });
  }

  return actions;
}

export function useAdminCommandPalette(props: {
  navItems: readonly AdminNavItem[];
  scope: CommandScope;
}) {
  const navigate = useNavigate();
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      hash: state.location.hash,
    }),
    structuralSharing: true,
  });
  const { t, i18n } = useTranslation(["command", "account", "notifications", "nav"]);
  const [query, setQuery] = useState("");
  const searchQuery = query.trim();
  const debouncedQuery = useDebouncedValue(searchQuery, 180);
  const isSearching = debouncedQuery.length > 0;

  const favoritePaths = useFavoritesStore((state) => state.paths);
  const recentRecords = useCommandRecentStore((state) => state.records);
  const recordRecent = useCommandRecentStore((state) => state.record);

  const pageEntries = useMemo(
    () => buildAdminNavCommandEntries(props.navItems, t),
    [i18n.language, i18n.resolvedLanguage, props.navItems, t],
  );

  const favoriteEntries = useMemo(
    () =>
      pageEntries.filter(
        (entry) => entry.action.type === "navigate" && favoritePaths.includes(entry.action.to),
      ),
    [favoritePaths, pageEntries],
  );

  const recentEntries = useMemo(
    () => resolveRecentCommandEntries(recentRecords, pageEntries),
    [pageEntries, recentRecords],
  );

  const actionEntries = useMemo(
    () =>
      buildActionEntries({
        scope: props.scope,
        t,
      }),
    [props.scope, t],
  );

  const filteredActionEntries = useMemo(
    () => actionEntries.filter((entry) => matchesCommandEntry(entry, debouncedQuery)),
    [actionEntries, debouncedQuery],
  );
  const filteredPageEntries = useMemo(
    () => pageEntries.filter((entry) => matchesCommandEntry(entry, debouncedQuery)),
    [debouncedQuery, pageEntries],
  );

  const usersQuery = useQuery({
    queryKey: ["command", "users", props.scope.workspaceId, debouncedQuery],
    enabled: isSearching && props.scope.kind === "workspace" && Boolean(props.scope.workspaceId),
    queryFn: async () => {
      if (props.scope.kind === "workspace" && props.scope.workspaceId) {
        return listTeamMembers(props.scope.workspaceId, { q: debouncedQuery, page: 1, size: 6 });
      }
      throw new Error("COMMAND_USERS_SCOPE_UNAVAILABLE");
    },
    staleTime: 20 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const userEntries = useMemo<CommandEntry[]>(() => {
    if (props.scope.kind === "workspace" && props.scope.workspaceId) {
      const to = `/w/${encodeURIComponent(props.scope.workspaceId)}/team/members/`;
      return (usersQuery.data?.items ?? []).map((member) => {
        const primary = (
          member.displayName ||
          member.username ||
          member.email ||
          member.userId
        ).trim();
        const secondary = member.email || member.username || member.userId;
        return {
          id: `user:${member.userId}`,
          key: `user:${member.userId}`,
          kind: "user",
          title: primary,
          subtitle: secondary,
          keywords: [primary, secondary, member.userId],
          avatar: { name: primary, assetRef: member.avatarUrl, shape: "circle" },
          action: { type: "navigate", to, search: { q: secondary, memberId: member.userId } },
          recent: {
            enabled: true,
            snapshot: {
              key: `user:${member.userId}`,
              kind: "user",
              title: primary,
              subtitle: secondary,
              keywords: [primary, secondary, member.userId],
              to,
              search: { q: secondary, memberId: member.userId },
              avatarName: primary,
              avatarAssetRef: member.avatarUrl,
              avatarShape: "circle",
            },
          },
        };
      });
    }

    return [];
  }, [props.scope, usersQuery.data?.items]);

  const assetsQuery = useQuery({
    queryKey: ["command", "assets", props.scope.workspaceId, debouncedQuery],
    enabled: isSearching && props.scope.kind === "workspace" && Boolean(props.scope.workspaceId),
    queryFn: async () =>
      listAssets(props.scope.workspaceId as string, {
        q: debouncedQuery,
        page: 1,
        size: 6,
        ordering: "-created_at",
      }),
    staleTime: 20 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const assetEntries = useMemo<CommandEntry[]>(() => {
    if (!props.scope.workspaceId) return [];
    const to = `/w/${encodeURIComponent(props.scope.workspaceId)}/assets/`;
    return (assetsQuery.data?.items ?? []).map((asset) => {
      const title = formatAssetCommandTitle(asset);
      const sizeText = formatAssetBytes(asset.sizeBytes);
      const secondary =
        [asset.mime || asset.ext || null, sizeText].filter(Boolean).join(" · ") || asset.id;
      const keywords = [
        title,
        asset.id,
        asset.originalFilename,
        asset.title,
        asset.slug,
        asset.ext,
        asset.mime,
      ].filter(Boolean) as string[];
      return {
        id: `asset:${asset.id}`,
        key: `asset:${asset.id}`,
        kind: "asset",
        title,
        subtitle: secondary,
        keywords,
        meta: asset.uploaderName || undefined,
        action: { type: "navigate", to, search: { q: title, assetId: asset.id } },
        recent: {
          enabled: true,
          snapshot: {
            key: `asset:${asset.id}`,
            kind: "asset",
            title,
            subtitle: secondary,
            keywords,
            to,
            search: { q: title, assetId: asset.id },
          },
        },
      };
    });
  }, [assetsQuery.data?.items, props.scope.workspaceId]);

  const sources = useMemo<readonly CommandSource[]>(
    () => [
      {
        id: "recent",
        mode: "browse",
        resolve: () => ({
          id: "recent",
          heading: t("command:COMMAND_GROUP_RECENT"),
          entries: recentEntries,
        }),
      },
      {
        id: "favorites",
        mode: "browse",
        resolve: () => ({
          id: "favorites",
          heading: t("command:COMMAND_GROUP_FAVORITES"),
          entries: favoriteEntries,
        }),
      },
      {
        id: "actions",
        mode: "both",
        resolve: () => ({
          id: "actions",
          heading: t("command:COMMAND_GROUP_ACTIONS"),
          entries: isSearching ? filteredActionEntries : actionEntries,
        }),
      },
      {
        id: "pages",
        mode: "search",
        resolve: () => ({
          id: "pages",
          heading: t("command:COMMAND_GROUP_PAGES"),
          entries: filteredPageEntries,
        }),
      },
      {
        id: "users",
        mode: "search",
        resolve: () => ({
          id: "users",
          heading: t("command:COMMAND_GROUP_USERS"),
          entries: userEntries,
          loading: usersQuery.isFetching,
        }),
      },
      {
        id: "assets",
        mode: "search",
        resolve: () => ({
          id: "assets",
          heading: t("command:COMMAND_GROUP_ASSETS"),
          entries: assetEntries,
          loading: assetsQuery.isFetching,
        }),
      },
    ],
    [
      actionEntries,
      assetEntries,
      assetsQuery.isFetching,
      favoriteEntries,
      filteredActionEntries,
      filteredPageEntries,
      isSearching,
      recentEntries,
      t,
      userEntries,
      usersQuery.isFetching,
    ],
  );

  const sections = useMemo<CommandSection[]>(
    () => resolveCommandSections(sources, { query: debouncedQuery, isSearching }),
    [debouncedQuery, isSearching, sources],
  );

  const onSelectEntry = (entry: CommandEntry) => {
    if (entry.recent?.enabled) recordRecent(entry.recent.snapshot);
    if (entry.action.type === "callback") {
      entry.action.run();
      return;
    }
    const usercenterTab = resolveUsercenterOverlayTabFromPath(entry.action.to);
    if (usercenterTab) {
      void navigate(
        buildUsercenterOverlayNavigate({
          currentLocation: location,
          tab: usercenterTab,
        }),
      );
      return;
    }
    void navigate({ to: entry.action.to as never, search: (entry.action.search ?? {}) as never });
  };

  return {
    query,
    setQuery,
    sections,
    isSearching,
    isRemoteSearching: isSearching && (usersQuery.isFetching || assetsQuery.isFetching),
    emptyText: isSearching ? t("command:COMMAND_EMPTY_SEARCH") : t("command:COMMAND_EMPTY_BROWSE"),
    onSelectEntry,
  };
}
