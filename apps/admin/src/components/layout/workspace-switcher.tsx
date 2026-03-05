import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Avatar, Button, Input } from "antd";
import { Building2, ChevronDown, PanelLeftIcon, Plus, RefreshCw, Search } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";
import type { OrganizationWorkspace } from "@/types/api";
import { listMyOrganizations } from "@/api/me";
import { listAllOrganizationWorkspaces } from "@/api/organization-workspaces";
import { getWorkspaceDetail } from "@/api/workspaces";
import { ContentGuard } from "@/components/common/content-guard";
import {
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@celestial/ui/floating-panel";
import { cn } from "@celestial/lib/utils";
import { Skeleton } from "@celestial/ui/skeleton";
import { buildOrganizationPath } from "@/lib/routing/organization-routing";
import { switchWorkspacePath } from "@/lib/routing/workspace-routing";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useSidebar } from "@celestial/ui/sidebar";

import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";

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

const switcherRowClassName = cn(
  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const SwitcherRow = motion.button;

export const breadcrumbTriggerClassName = cn(
  "flex items-center gap-1 rounded-md px-1.5 py-0.5",
  "text-label-secondary border-0 bg-transparent hover:bg-accent hover:text-foreground",
  "data-[state=open]:bg-accent data-[state=open]:text-foreground transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const TRIGGER_HEIGHT_CLASSNAME = "h-10";

const sidebarTriggerShellClassName = cn(
  "group relative",
  "w-full min-w-0",
  "flex items-center gap-0",
  "group-hover:gap-2 group-focus-within:gap-2",
  "transition-[gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
);

const sidebarTriggerButtonClassName = cn(
  TRIGGER_HEIGHT_CLASSNAME,
  "min-w-0 flex-1 group-data-[collapsible=icon]:flex-none",
  "flex items-center gap-2",
  "group-data-[collapsible=icon]:gap-0",
  "rounded-lg pl-1 pr-2 py-1 group-data-[collapsible=icon]:px-0",
  "bg-transparent text-sidebar-foreground",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
  "transition-[width,padding,color,background-color] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
  "text-left",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center",
);

const collapseButtonClassName = cn(
  TRIGGER_HEIGHT_CLASSNAME,
  "w-0 shrink-0 overflow-hidden rounded-lg p-0",
  "opacity-0 pointer-events-none",
  "bg-transparent text-sidebar-foreground",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "transition-[width,opacity,color,background-color] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
  "group-hover:w-10 group-hover:opacity-100 group-hover:pointer-events-auto",
  "group-data-[collapsible=icon]:w-0",
  "group-data-[collapsible=icon]:opacity-0",
  "group-data-[collapsible=icon]:pointer-events-none",
);

const collapsedCollapseButtonClassName = cn(
  TRIGGER_HEIGHT_CLASSNAME,
  "w-10",
  "rounded-lg p-0",
  "bg-transparent text-sidebar-foreground",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "transition-[color,background-color,transform] duration-200 ease-out motion-reduce:transition-none",
);

function CollapseButton(props: { ariaLabel: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={cn(collapseButtonClassName, props.className)}
      aria-label={props.ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      <PanelLeftIcon className="mx-auto size-4" aria-hidden="true" />
    </button>
  );
}

function CollapsedCollapseButton(props: { ariaLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={collapsedCollapseButtonClassName}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
    >
      <PanelLeftIcon className="mx-auto size-4" aria-hidden="true" />
    </button>
  );
}

function workspaceSearchText(workspace: OrganizationWorkspace): string {
  return [workspace.name, workspace.slug, workspace.description]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function WorkspaceList(props: {
  workspaces: OrganizationWorkspace[];
  currentWorkspaceId: string | null;
  descriptionFallback: string;
  onSelect: (id: string) => void;
}) {
  const { closeFloatingPanel } = useFloatingPanel();

  return (
    <motion.div
      className="flex flex-col gap-0.5"
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {props.workspaces.map((ws) => {
        const title = ws.name || ws.slug;
        const current = ws.workspaceId === props.currentWorkspaceId;
        return (
          <SwitcherRow
            key={ws.workspaceId}
            variants={listItemVariants}
            type="button"
            className={cn(
              switcherRowClassName,
              current
                ? "bg-accent text-accent-foreground"
                : "text-label-secondary hover:bg-muted hover:text-foreground",
            )}
            onClick={() => {
              closeFloatingPanel();
              props.onSelect(ws.workspaceId);
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
                  "truncate",
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
                {ws.description || props.descriptionFallback}
              </div>
            </div>
          </SwitcherRow>
        );
      })}
    </motion.div>
  );
}

function WsPanelContent(props: {
  workspaces: OrganizationWorkspace[];
  loading: boolean;
  fetching: boolean;
  error: unknown;
  currentWorkspaceId: string | null;
  canCreateWorkspace: boolean;
  canAccessOrganization: boolean;
  organizationWorkspacesPath: string | null;
  onRefresh: () => void;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onOpenOrganizationWorkspaces: () => void;
}) {
  const { t } = useTranslation(["common", "nav"]);
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
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-2">
        <Button
          type="text"
          size="small"
          icon={<RefreshCw className={cn("size-3.5", props.fetching ? "animate-spin" : null)} />}
          aria-label={t("common:REFRESH")}
          onClick={props.onRefresh}
          autoInsertSpace={false}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common:WORKSPACE_SWITCHER_WORKSPACE_SEARCH_PLACEHOLDER")}
          allowClear
          variant="filled"
          prefix={<Search className="size-3.5 text-label-secondary" />}
        />
      </div>

      <div className="px-2 py-2">
        {props.loading ? (
          <PanelListSkeleton rows={5} />
        ) : props.error ? (
          <ContentGuard loading={false} error={props.error} onRetry={props.onRefresh} />
        ) : empty ? (
          <div className="px-2 py-4 text-center text-label-secondary">
            {keyword
              ? t("common:WORKSPACE_SWITCHER_WORKSPACE_NO_RESULTS_TITLE")
              : t("common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY")}
          </div>
        ) : (
          <WorkspaceList
            workspaces={filtered}
            currentWorkspaceId={props.currentWorkspaceId}
            descriptionFallback={t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
            onSelect={props.onSelectWorkspace}
          />
        )}
      </div>

      <div className="border-t border-border/60 p-2">
        {props.canAccessOrganization && props.organizationWorkspacesPath ? (
          <Button
            type="link"
            block
            size="small"
            className="justify-start px-1"
            icon={<Building2 className="size-3.5" aria-hidden="true" />}
            onClick={() => {
              closeFloatingPanel();
              props.onOpenOrganizationWorkspaces();
            }}
            autoInsertSpace={false}
          >
            {t("common:WORKSPACE_SWITCHER_OPEN_ORG_WORKSPACES")}
          </Button>
        ) : null}
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
          autoInsertSpace={false}
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
  const { toggleSidebar } = useSidebar();

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

  const selectedOrgId = useMemo(() => {
    if (!organizationId) return null;
    const items = organizationsQuery.data?.items ?? [];
    return items.find((item) => item.organization.id === organizationId)?.organization.id ?? null;
  }, [organizationId, organizationsQuery.data?.items]);

  const canAccessOrganization = useMemo(() => {
    if (!organizationId) return false;
    const items = organizationsQuery.data?.items ?? [];
    return items.some((item) => item.organization.id === organizationId);
  }, [organizationId, organizationsQuery.data?.items]);

  const organizationWorkspacesPath = useMemo(() => {
    if (!organizationId) return null;
    return buildOrganizationPath(String(organizationId), "/workspaces");
  }, [organizationId]);

  return (
    <FloatingPanelRoot>
      <div className="w-full min-w-0">
        <div
          className={cn(
            sidebarTriggerShellClassName,
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
          )}
        >
          <FloatingPanelTrigger
            title={t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
            aria-label={t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
            className={sidebarTriggerButtonClassName}
          >
            <Avatar size={32} className="shrink-0 rounded-md">
              {firstLetter(workspaceName || t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE"))}
            </Avatar>

            <div
              className={cn(
                "min-w-0 flex-1",
                NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
                "group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none",
              )}
            >
              <div className="truncate text-callout font-semibold text-foreground">
                {workspaceName || t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
              </div>
            </div>

            <ChevronDown
              className={cn(
                "size-4 shrink-0 opacity-70 transition-opacity group-hover:opacity-100",
                NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
              )}
              aria-hidden="true"
            />
          </FloatingPanelTrigger>

          <CollapseButton ariaLabel={t("common:SIDEBAR_TOGGLE")} onClick={toggleSidebar} />
        </div>

        <div
          className={cn(
            "mt-0 flex justify-center overflow-hidden",
            "h-0 opacity-0 pointer-events-none",
            "transition-[height,opacity,margin-top] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
            "group-data-[collapsible=icon]:mt-2",
            "group-data-[collapsible=icon]:h-10",
            "group-data-[collapsible=icon]:opacity-100",
            "group-data-[collapsible=icon]:pointer-events-auto",
          )}
        >
          <CollapsedCollapseButton ariaLabel={t("common:SIDEBAR_TOGGLE")} onClick={toggleSidebar} />
        </div>
      </div>

      <FloatingPanelContent placement="bottom" showTitle={false} className="w-[280px] p-0">
        <WsPanelContent
          workspaces={workspaceQuery.data ?? []}
          loading={workspaceQuery.isLoading}
          fetching={workspaceQuery.isFetching}
          error={workspaceQuery.error}
          currentWorkspaceId={currentWorkspaceId}
          canCreateWorkspace={canCreateWorkspace}
          canAccessOrganization={canAccessOrganization}
          organizationWorkspacesPath={organizationWorkspacesPath}
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
            if (!canCreateWorkspace || !selectedOrgId) return;
            void navigate({
              to: buildOrganizationPath(selectedOrgId, "/workspaces") as never,
              search: { create: "1" } as never,
            });
          }}
          onOpenOrganizationWorkspaces={() => {
            if (!organizationWorkspacesPath) return;
            void navigate({ to: organizationWorkspacesPath as never });
          }}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
