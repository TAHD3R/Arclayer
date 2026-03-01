import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Avatar, Button, Input } from "antd";
import { motion, type Variants } from "motion/react";
import { ArrowUpRight, ChevronDown, Plus, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listMyOrganizations } from "@/api/me";
import type { MyOrganizationMemberPreview, OrganizationWorkspace } from "@/types/api";
import { listAllOrganizationWorkspaces } from "@/api/organization-workspaces";
import { getWorkspaceDetail } from "@/api/workspaces";
import { ContentGuard } from "@/components/common/content-guard";
import {
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@/components/ui/floating-panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildOrganizationPath,
  parseOrganizationIdFromPath,
} from "@/lib/routing/organization-routing";
import { switchWorkspacePath } from "@/lib/routing/workspace-routing";
import { cn } from "@/lib/utils";

import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type OrganizationOption = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  memberCount: number;
  membersPreview: MyOrganizationMemberPreview[];
};

function normalizeSearch(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function firstLetter(input: string): string {
  const text = String(input || "").trim();
  if (!text) return "?";
  return text.slice(0, 1).toUpperCase();
}

function workspaceSearchText(workspace: OrganizationWorkspace): string {
  return [workspace.name, workspace.slug, workspace.description]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function PanelListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1.5 px-2 py-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-md px-3 py-2">
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

const DRILL_EASE = [0.2, 0, 0, 1] as const;

const listContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};

const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.16, ease: DRILL_EASE } },
};

// ─── 触发器样式（面包屑节点风格） ─────────────────────────────────────────────

export const breadcrumbTriggerClassName = cn(
  "flex items-center gap-1 rounded-md px-1.5 py-0.5",
  "text-label-secondary border-0 bg-transparent",
  "hover:bg-accent hover:text-foreground",
  "data-[state=open]:bg-accent data-[state=open]:text-foreground",
  "transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

// ─── AdminOrgSwitcher ─────────────────────────────────────────────────────────

function OrgPanelContent(props: {
  organizations: OrganizationOption[];
  loading: boolean;
  fetching: boolean;
  error: unknown;
  currentOrgId: string | null;
  onRefresh: () => void;
}) {
  const { t } = useTranslation(["common"]);
  const { closeFloatingPanel } = useFloatingPanel();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const keyword = normalizeSearch(search);
    if (!keyword) return props.organizations;
    return props.organizations.filter((org) => {
      const text = [org.name, org.slug].map((v) => String(v || "").toLowerCase()).join(" ");
      return text.includes(keyword);
    });
  }, [search, props.organizations]);

  const keyword = normalizeSearch(search);
  const empty = !props.organizations.length || filtered.length === 0;

  const handleNavigateToOrg = (id: string) => {
    closeFloatingPanel();
    void navigate({ to: buildOrganizationPath(id) as never });
  };

  return (
    <div className="flex max-h-[360px] w-full flex-col overflow-hidden">
      {/* 搜索栏 */}
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-2">
        <Button
          type="text"
          size="small"
          icon={
            <RefreshCw className={cn("size-3.5", props.fetching ? "animate-spin" : undefined)} />
          }
          aria-label={t("common:REFRESH")}
          onClick={props.onRefresh}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common:WORKSPACE_SWITCHER_ORG_SEARCH_PLACEHOLDER")}
          allowClear
          variant="borderless"
          prefix={<Search className="size-3.5 text-label-secondary" />}
        />
      </div>

      {/* 列表 */}
      <div>
        {props.loading ? (
          <PanelListSkeleton rows={5} />
        ) : props.error ? (
          <ContentGuard
            loading={false}
            error={props.error}
            onRetry={props.onRefresh}
            className="py-4"
          />
        ) : empty ? (
          <div className="px-4 py-6 text-center  text-label-secondary">
            {keyword
              ? t("common:WORKSPACE_SWITCHER_ORG_NO_RESULTS_TITLE")
              : t("common:WORKSPACE_SWITCHER_ORG_EMPTY")}
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-0.5 px-2 py-2"
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {filtered.map((org) => {
              const selected = org.id === props.currentOrgId;
              return (
                <motion.div
                  key={org.id}
                  variants={listItemVariants}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "text-label-secondary hover:bg-muted hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 focus-visible:outline-none"
                    onClick={() => handleNavigateToOrg(org.id)}
                  >
                    <Avatar size={22} className="shrink-0 bg-muted text-foreground text-caption">
                      {firstLetter(org.name)}
                    </Avatar>
                    <div className="min-w-0 flex-1 text-left">
                      <div
                        className={cn(
                          "truncate ",
                          selected ? "font-semibold text-accent-foreground" : "text-foreground",
                        )}
                      >
                        {org.name}
                      </div>
                      <div
                        className={cn(
                          "truncate text-caption",
                          selected ? "text-accent-foreground/70" : "text-label-secondary",
                        )}
                      >
                        {t("common:WORKSPACE_SWITCHER_ORG_MEMBERS_COUNT", {
                          count: org.memberCount,
                        })}
                      </div>
                    </div>
                  </button>

                  {/* ↗ 跳转到组织 Dashboard */}
                  <button
                    type="button"
                    aria-label={t("common:WORKSPACE_SWITCHER_GO_TO_ORG")}
                    className={cn(
                      "shrink-0 rounded p-0.5 opacity-0 transition-opacity",
                      "group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none",
                      "hover:bg-accent-foreground/10",
                      selected ? "text-accent-foreground" : "text-label-secondary",
                    )}
                    onClick={() => handleNavigateToOrg(org.id)}
                  >
                    <ArrowUpRight className="size-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export function AdminOrgSwitcher() {
  const { t } = useTranslation(["common"]);
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isWorkspaceScopeRoute = pathname.startsWith("/w/");

  const organizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "switcher"],
    enabled: Boolean(accessToken),
    queryFn: listMyOrganizations,
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const organizations = useMemo<OrganizationOption[]>(() => {
    const items = organizationsQuery.data?.items ?? [];
    return items
      .filter((item) => item.membership.status === "active")
      .map((item) => ({
        id: item.organization.id,
        name: item.organization.name,
        slug: item.organization.slug,
        role: item.membership.role,
        memberCount: item.memberCount,
        membersPreview: item.membersPreview,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [organizationsQuery.data?.items]);

  // 从工作区详情反查当前组织
  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", currentWorkspaceId],
    enabled: Boolean(accessToken && currentWorkspaceId && isWorkspaceScopeRoute),
    queryFn: async () => getWorkspaceDetail(String(currentWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const routeOrganizationId = parseOrganizationIdFromPath(pathname);
  const currentOrganization = useMemo(() => {
    if (!organizations.length) return null;
    if (routeOrganizationId) {
      const matched = organizations.find((item) => item.id === routeOrganizationId);
      if (matched) return matched;
    }
    const wsOrgId = workspaceDetailQuery.data?.organizationId;
    if (wsOrgId) {
      const matched = organizations.find((item) => item.id === wsOrgId);
      if (matched) return matched;
    }
    return organizations[0] ?? null;
  }, [organizations, routeOrganizationId, workspaceDetailQuery.data?.organizationId]);

  const orgName = currentOrganization?.name ?? "";
  const isLoading = organizationsQuery.isLoading;

  return (
    <FloatingPanelRoot>
      <FloatingPanelTrigger
        title={t("common:WORKSPACE_SWITCHER_SELECT_ORG")}
        aria-label={t("common:WORKSPACE_SWITCHER_SELECT_ORG")}
        className={breadcrumbTriggerClassName}
      >
        {isLoading ? (
          <Skeleton className="h-3.5 w-20" />
        ) : (
          <span className="truncate">{orgName || t("common:WORKSPACE_SWITCHER_SELECT_ORG")}</span>
        )}
        <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      </FloatingPanelTrigger>

      <FloatingPanelContent placement="bottom" showTitle={false} className="w-[280px] p-0">
        <OrgPanelContent
          organizations={organizations}
          loading={organizationsQuery.isLoading}
          fetching={organizationsQuery.isFetching}
          error={organizationsQuery.error}
          currentOrgId={currentOrganization?.id ?? null}
          onRefresh={() => void organizationsQuery.refetch()}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}

// ─── AdminWorkspaceSwitcher ───────────────────────────────────────────────────

function WsPanelContent(props: {
  workspaces: OrganizationWorkspace[];
  loading: boolean;
  fetching: boolean;
  error: unknown;
  currentWorkspaceId: string | null;
  canCreateWorkspace: boolean;
  onRefresh: () => void;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
}) {
  const { t } = useTranslation(["common"]);
  const { closeFloatingPanel } = useFloatingPanel();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const keyword = normalizeSearch(search);
    if (!keyword) return props.workspaces;
    return props.workspaces.filter((ws) => workspaceSearchText(ws).includes(keyword));
  }, [search, props.workspaces]);

  const keyword = normalizeSearch(search);
  const empty = !props.workspaces.length || filtered.length === 0;

  return (
    <div className="flex max-h-[360px] w-full flex-col overflow-hidden">
      {/* 搜索栏 */}
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-2">
        <Button
          type="text"
          size="small"
          icon={
            <RefreshCw className={cn("size-3.5", props.fetching ? "animate-spin" : undefined)} />
          }
          aria-label={t("common:REFRESH")}
          onClick={props.onRefresh}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common:WORKSPACE_SWITCHER_WORKSPACE_SEARCH_PLACEHOLDER")}
          allowClear
          variant="borderless"
          prefix={<Search className="size-3.5 text-label-secondary" />}
        />
      </div>

      {/* 列表 */}
      <div>
        {props.loading ? (
          <PanelListSkeleton rows={5} />
        ) : props.error ? (
          <ContentGuard
            loading={false}
            error={props.error}
            onRetry={props.onRefresh}
            className="py-4"
          />
        ) : empty ? (
          <div className="px-4 py-6 text-center  text-label-secondary">
            {keyword
              ? t("common:WORKSPACE_SWITCHER_WORKSPACE_NO_RESULTS_TITLE")
              : t("common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY")}
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-0.5 px-2 py-2"
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {filtered.map((ws) => {
              const title = ws.name || ws.slug;
              const current = ws.workspaceId === props.currentWorkspaceId;
              return (
                <motion.button
                  key={ws.workspaceId}
                  variants={listItemVariants}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    current
                      ? "bg-accent text-accent-foreground"
                      : "text-label-secondary hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => {
                    closeFloatingPanel();
                    props.onSelectWorkspace(ws.workspaceId);
                  }}
                >
                  <Avatar
                    size={22}
                    src={ws.iconUrl ?? undefined}
                    className="shrink-0 bg-muted text-foreground text-caption"
                  >
                    {firstLetter(title)}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate ",
                        current ? "font-semibold text-accent-foreground" : "text-foreground",
                      )}
                    >
                      {title}
                    </div>
                    <div
                      className={cn(
                        "truncate text-caption",
                        current ? "text-accent-foreground/70" : "text-label-secondary",
                      )}
                    >
                      {ws.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* 底部新建按钮 */}
      <div className="border-t border-border/60 p-2">
        <Button
          type="link"
          block
          size="small"
          className="justify-start px-1"
          icon={<Plus className="size-3.5" aria-hidden="true" />}
          disabled={!props.canCreateWorkspace}
          onClick={() => {
            closeFloatingPanel();
            props.onCreateWorkspace();
          }}
        >
          {t("common:WORKSPACE_SWITCHER_CREATE")}
        </Button>
      </div>
    </div>
  );
}

export function AdminWorkspaceSwitcher() {
  const { t } = useTranslation(["common"]);
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // 从工作区详情反查当前组织
  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", currentWorkspaceId],
    enabled: Boolean(accessToken && currentWorkspaceId),
    queryFn: async () => getWorkspaceDetail(String(currentWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const organizationId = workspaceDetailQuery.data?.organizationId ?? null;
  const workspaceName = workspaceDetailQuery.data?.name ?? "";

  // 工作区列表（跟随当前组织）
  const workspaceQuery = useQuery({
    queryKey: ["organization", "workspaces", "switcher", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () =>
      listAllOrganizationWorkspaces({
        organizationId: String(organizationId!),
        archived: false,
        enterableOnly: true,
        pageSize: 100,
      }),
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  // 判断是否可新建工作区（需要从组织列表缓存中查角色）
  const organizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "switcher"],
    enabled: Boolean(accessToken && organizationId),
    queryFn: listMyOrganizations,
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const canCreateWorkspace = useMemo(() => {
    if (!organizationId) return false;
    const items = organizationsQuery.data?.items ?? [];
    const found = items.find((item) => item.organization.id === organizationId);
    if (!found) return false;
    return found.membership.role === "owner" || found.membership.role === "admin";
  }, [organizationId, organizationsQuery.data?.items]);

  const selectedOrg = useMemo(() => {
    if (!organizationId) return null;
    const items = organizationsQuery.data?.items ?? [];
    return items.find((item) => item.organization.id === organizationId) ?? null;
  }, [organizationId, organizationsQuery.data?.items]);

  const isLoading = workspaceDetailQuery.isLoading;

  return (
    <FloatingPanelRoot>
      <FloatingPanelTrigger
        title={t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
        aria-label={t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
        className={breadcrumbTriggerClassName}
      >
        {isLoading ? (
          <Skeleton className="h-3.5 w-24" />
        ) : (
          <span className="truncate">
            {workspaceName || t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
          </span>
        )}
        <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      </FloatingPanelTrigger>

      <FloatingPanelContent placement="bottom" showTitle={false} className="w-[280px] p-0">
        <WsPanelContent
          workspaces={workspaceQuery.data ?? []}
          loading={workspaceQuery.isLoading}
          fetching={workspaceQuery.isFetching}
          error={workspaceQuery.error}
          currentWorkspaceId={currentWorkspaceId}
          canCreateWorkspace={canCreateWorkspace}
          onRefresh={() => void workspaceQuery.refetch()}
          onSelectWorkspace={(nextWorkspaceId) => {
            setCurrentWorkspaceId(nextWorkspaceId);
            const nextPath = switchWorkspacePath({
              pathname,
              currentWorkspaceId,
              nextWorkspaceId,
            });
            void navigate({ to: nextPath as never });
          }}
          onCreateWorkspace={() => {
            if (!canCreateWorkspace || !selectedOrg) return;
            void navigate({
              to: buildOrganizationPath(selectedOrg.organization.id, "/workspaces") as never,
              search: { create: "1" } as never,
            });
          }}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
