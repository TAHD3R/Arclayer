import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import { listOrganizationCapabilities } from "@/api/org-extensions";
import { listWorkspaceCapabilities } from "@/api/workspace-extensions";
import {
  organizationCapabilitiesQueryKey,
  workspaceCapabilitiesQueryKey,
} from "@/lib/extensions/query-keys";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { ExtensionScope, InstalledExtensionItem } from "../types";
import { useExtensionsFilters } from "./use-extensions-filters";
import { useExtensionsMenuActions } from "./use-extensions-menu-actions";

const PAGE_SIZE = 12;

type UseExtensionsAccess = {
  isOrganizationScope: boolean;
  workspaceId: string | null;
  organizationId: string | null;
  canManage: boolean;
};

export type UseExtensionsOptions = {
  scope?: ExtensionScope;
  organizationId?: string;
};

function useExtensionsAccess(opts: {
  scope: ExtensionScope;
  organizationId?: string;
}): UseExtensionsAccess {
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const isOrganizationScope = opts.scope === "organization";

  const authzQuery = useQuery({
    queryKey: ["workspace", "authz", workspaceId],
    enabled: Boolean(accessToken && workspaceId && !isOrganizationScope),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return getMyWorkspaceAuthz(workspaceId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const myOrganizationQuery = useQuery({
    queryKey: ["me", "organization", "extensions-center"],
    enabled: Boolean(accessToken && isOrganizationScope),
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const canManage = useMemo(() => {
    if (isOrganizationScope) {
      const role = myOrganizationQuery.data?.membership?.role;
      return role === "owner" || role === "admin";
    }
    const codes = authzQuery.data?.permissionCodes ?? [];
    return codes.includes("system:extensions:manage") || Boolean(authzQuery.data?.isSuperuser);
  }, [
    authzQuery.data?.isSuperuser,
    authzQuery.data?.permissionCodes,
    isOrganizationScope,
    myOrganizationQuery.data?.membership?.role,
  ]);

  const organizationId = useMemo(() => {
    if (!isOrganizationScope) return null;
    return (
      String(opts.organizationId || myOrganizationQuery.data?.organization.id || "").trim() || null
    );
  }, [isOrganizationScope, myOrganizationQuery.data?.organization.id, opts.organizationId]);

  return {
    isOrganizationScope,
    workspaceId: isOrganizationScope ? null : (workspaceId ?? null),
    organizationId,
    canManage,
  };
}

function useCapabilitiesQuery(input: UseExtensionsAccess) {
  const { isOrganizationScope, workspaceId } = input;
  const accessToken = useAuthStore((s) => s.accessToken);

  const queryKey = useMemo(
    () =>
      isOrganizationScope
        ? organizationCapabilitiesQueryKey()
        : workspaceCapabilitiesQueryKey(workspaceId),
    [isOrganizationScope, workspaceId],
  );

  const listQuery = useQuery({
    queryKey,
    enabled: Boolean(accessToken && (isOrganizationScope || workspaceId)),
    queryFn: async () => {
      if (isOrganizationScope) return listOrganizationCapabilities();
      if (!workspaceId) throw new Error("workspaceId is required");
      return listWorkspaceCapabilities(workspaceId);
    },
    staleTime: 15 * 1000,
    retry: false,
  });

  const items = useMemo(
    () => (listQuery.data?.items ?? []) as InstalledExtensionItem[],
    [listQuery.data?.items],
  );

  return { queryKey, listQuery, items };
}

export function useExtensions({ scope = "workspace", organizationId }: UseExtensionsOptions = {}) {
  const { t } = useTranslation(["plugin", "nav", "common", "settings"]);

  const access = useExtensionsAccess({ scope, organizationId });
  const { workspaceId, isOrganizationScope, canManage } = access;
  const { queryKey, listQuery, items } = useCapabilitiesQuery(access);

  const filters = useExtensionsFilters({ items, t: (key) => t(key), pageSize: PAGE_SIZE });
  const actions = useExtensionsMenuActions({
    scope,
    workspaceId,
    organizationId: access.organizationId,
    canManage,
    listQueryKey: queryKey,
    t,
  });

  return {
    t,
    isOrganizationScope,
    workspaceId,
    canManage,
    listQuery,

    categoryTabs: filters.categoryTabs,
    category: filters.category,
    setCategory: filters.setCategory,
    searchQuery: filters.searchQuery,
    setSearchQuery: filters.setSearchQuery,
    officialChecked: filters.officialChecked,
    setOfficialChecked: filters.setOfficialChecked,
    communityChecked: filters.communityChecked,
    setCommunityChecked: filters.setCommunityChecked,
    explorePageItems: filters.explorePageItems,
    exploreTotal: filters.exploreTotal,
    filtered: filters.filtered,
    page: filters.page,
    setPage: filters.setPage,
    pageSize: PAGE_SIZE,

    filteredInstalled: filters.filteredInstalled,
    installedPageItems: filters.installedPageItems,
    installedTotal: filters.installedTotal,
    installedPage: filters.installedPage,
    setInstalledPage: filters.setInstalledPage,
    buildConfigureHref: actions.buildConfigureHref,
    buildMenuItems: actions.buildMenuItems,
  };
}
