import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Avatar, Button, Input } from "antd";
import { motion, type Variants } from "motion/react";
import { ChevronDown, Plus, RefreshCw, Search } from "lucide-react";
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

function PanelListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-3 py-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-md border border-border/60 px-3 py-2">
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
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: DRILL_EASE } },
};

function OrgSwitcherPanel(props: {
  organizations: OrganizationOption[];
  loading: boolean;
  fetching: boolean;
  error: unknown;
  currentOrganizationId: string | null;
  onRefresh: () => void;
  onSelectOrganization: (id: string) => void;
}) {
  const { t } = useTranslation(["common"]);
  const { closeFloatingPanel } = useFloatingPanel();
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

  return (
    <div className="flex max-h-120 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2.5">
        <Button
          type="text"
          icon={<RefreshCw className={cn("size-4", props.fetching ? "animate-spin" : undefined)} />}
          aria-label={t("common:REFRESH")}
          onClick={props.onRefresh}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common:WORKSPACE_SWITCHER_ORG_SEARCH_PLACEHOLDER")}
          allowClear
          variant="borderless"
          prefix={<Search className="size-4 text-label-secondary" />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-2">
        {props.loading ? (
          <PanelListSkeleton rows={6} />
        ) : props.error ? (
          <ContentGuard
            loading={false}
            error={props.error}
            onRetry={props.onRefresh}
            className="py-4"
          />
        ) : empty ? (
          <div className="px-4 py-8 text-center text-footnote text-label-secondary">
            {keyword
              ? t("common:WORKSPACE_SWITCHER_ORG_NO_RESULTS_TITLE")
              : t("common:WORKSPACE_SWITCHER_ORG_EMPTY")}
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-1.5 px-2"
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {filtered.map((org) => {
              const current = org.id === props.currentOrganizationId;
              return (
                <motion.button
                  key={org.id}
                  variants={listItemVariants}
                  type="button"
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    current
                      ? "bg-accent text-accent-foreground"
                      : "text-label-secondary hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => {
                    closeFloatingPanel();
                    props.onSelectOrganization(org.id);
                  }}
                >
                  <Avatar size={28} className="shrink-0 bg-muted text-foreground">
                    {firstLetter(org.name)}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-footnote",
                        current ? "text-accent-foreground" : "text-foreground",
                      )}
                    >
                      {org.name}
                    </div>
                    <div
                      className={cn(
                        "truncate text-footnote",
                        current ? "text-accent-foreground/80" : "text-label-secondary",
                      )}
                    >
                      {t("common:WORKSPACE_SWITCHER_ORG_MEMBERS_COUNT", {
                        count: org.memberCount,
                      })}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function WsSwitcherPanel(props: {
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
    <div className="flex max-h-120 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2.5">
        <Button
          type="text"
          icon={<RefreshCw className={cn("size-4", props.fetching ? "animate-spin" : undefined)} />}
          aria-label={t("common:REFRESH")}
          onClick={props.onRefresh}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common:WORKSPACE_SWITCHER_WORKSPACE_SEARCH_PLACEHOLDER")}
          allowClear
          variant="borderless"
          prefix={<Search className="size-4 text-label-secondary" />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-2">
        {props.loading ? (
          <PanelListSkeleton rows={6} />
        ) : props.error ? (
          <ContentGuard
            loading={false}
            error={props.error}
            onRetry={props.onRefresh}
            className="py-4"
          />
        ) : empty ? (
          <div className="px-4 py-8 text-center text-footnote text-label-secondary">
            {keyword
              ? t("common:WORKSPACE_SWITCHER_WORKSPACE_NO_RESULTS_TITLE")
              : t("common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY")}
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-1.5 px-2"
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
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
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
                    size={28}
                    src={ws.iconUrl ?? undefined}
                    className="shrink-0 bg-muted text-foreground"
                  >
                    {firstLetter(title)}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-footnote",
                        current ? "text-accent-foreground" : "text-foreground",
                      )}
                    >
                      {title}
                    </div>
                    <div
                      className={cn(
                        "truncate text-footnote",
                        current ? "text-accent-foreground/80" : "text-label-secondary",
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

      <div className="border-t border-border/60 p-2">
        <Button
          type="link"
          block
          className="justify-start px-0"
          icon={<Plus className="size-4" aria-hidden="true" />}
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

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", currentWorkspaceId],
    enabled: Boolean(accessToken && currentWorkspaceId && isWorkspaceScopeRoute),
    queryFn: async () => getWorkspaceDetail(String(currentWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceOrganization = useMemo(() => {
    const organizationId = workspaceDetailQuery.data?.organizationId;
    if (!organizationId) return null;
    return organizations.find((item) => item.id === organizationId) ?? null;
  }, [organizations, workspaceDetailQuery.data?.organizationId]);

  const routeOrganizationId = parseOrganizationIdFromPath(pathname);
  const currentOrganization = useMemo(() => {
    if (!organizations.length) return null;
    if (routeOrganizationId) {
      const matched = organizations.find((item) => item.id === routeOrganizationId);
      if (matched) return matched;
    }
    if (workspaceOrganization) return workspaceOrganization;
    return organizations[0] ?? null;
  }, [organizations, routeOrganizationId, workspaceOrganization]);

  const organizationName =
    (isWorkspaceScopeRoute ? workspaceOrganization?.name : null) || currentOrganization?.name || "";
  const workspaceName = useMemo(
    () => (isWorkspaceScopeRoute ? String(workspaceDetailQuery.data?.name || "").trim() : ""),
    [isWorkspaceScopeRoute, workspaceDetailQuery.data?.name],
  );

  const workspaceQuery = useQuery({
    queryKey: ["organization", "workspaces", "switcher", currentOrganization?.id],
    enabled: Boolean(currentOrganization),
    queryFn: async () =>
      listAllOrganizationWorkspaces({
        organizationId: String(currentOrganization!.id),
        archived: false,
        enterableOnly: true,
        pageSize: 100,
      }),
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const canCreateWorkspace =
    currentOrganization?.role === "owner" || currentOrganization?.role === "admin";

  const headerTriggerClassName = cn(
    "flex items-center gap-1.5 rounded-md px-2 py-1",
    "text-footnote text-label-secondary border-0 bg-transparent",
    "hover:bg-accent hover:text-foreground",
    "data-[state=open]:bg-accent data-[state=open]:text-foreground",
    "transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  return (
    <div className="flex max-w-xs min-w-0 items-center gap-0.5">
      <FloatingPanelRoot>
        <FloatingPanelTrigger
          title={t("common:WORKSPACE_SWITCHER_SELECT_ORG")}
          className={headerTriggerClassName}
        >
          <span className="max-w-32 truncate">
            {organizationName || t("common:WORKSPACE_SWITCHER_SELECT_ORG")}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </FloatingPanelTrigger>

        <FloatingPanelContent
          placement="bottom"
          showTitle
          description={t("common:WORKSPACE_SWITCHER_ORG_PANEL_DESC")}
          className="w-80 p-0"
        >
          <OrgSwitcherPanel
            organizations={organizations}
            loading={organizationsQuery.isLoading}
            fetching={organizationsQuery.isFetching}
            error={organizationsQuery.error}
            currentOrganizationId={currentOrganization?.id ?? null}
            onRefresh={() => {
              void organizationsQuery.refetch();
            }}
            onSelectOrganization={(organizationId) => {
              setCurrentWorkspaceId(null);
              void navigate({ to: buildOrganizationPath(organizationId) });
            }}
          />
        </FloatingPanelContent>
      </FloatingPanelRoot>

      <div className="mx-1 h-4 w-px bg-border" />

      <FloatingPanelRoot>
        <FloatingPanelTrigger
          title={t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
          className={headerTriggerClassName}
        >
          <span className="max-w-36 truncate">
            {workspaceName || t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </FloatingPanelTrigger>

        <FloatingPanelContent
          placement="bottom"
          showTitle
          description={t("common:WORKSPACE_SWITCHER_WORKSPACE_PANEL_DESC")}
          className="w-80 p-0"
        >
          <WsSwitcherPanel
            workspaces={workspaceQuery.data ?? []}
            loading={workspaceQuery.isLoading}
            fetching={workspaceQuery.isFetching}
            error={workspaceQuery.error}
            currentWorkspaceId={currentWorkspaceId}
            canCreateWorkspace={canCreateWorkspace}
            onRefresh={() => {
              void workspaceQuery.refetch();
            }}
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
              if (!canCreateWorkspace || !currentOrganization) return;
              void navigate({
                to: buildOrganizationPath(currentOrganization.id, "/workspaces"),
                search: { create: "1" } as never,
              });
            }}
          />
        </FloatingPanelContent>
      </FloatingPanelRoot>
    </div>
  );
}
