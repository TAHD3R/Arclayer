import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "antd";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Compass,
  PanelLeftIcon,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { listMyOrganizations } from "@/api/me";
import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import { getWorkspaceDetail } from "@/api/workspaces";
import { OrganizationAvatar, WorkspaceAvatar } from "@/components/common/entity-avatar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import { buildOrganizationPath } from "@/lib/routing/organization-routing";
import { switchWorkspacePath, workspaceHomePath } from "@/lib/routing/workspace-routing";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@celestial/lib/utils";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@celestial/ui/floating-panel";
import { useSidebar } from "@celestial/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@celestial/ui/tooltip";

import type { OrganizationWorkspace } from "@/types/api";

// ============================================================================
// Style Constants
// ============================================================================

const TRIGGER_HEIGHT_CLASSNAME = "!h-10";
const DEFAULT_TOOLTIP_SIDE_OFFSET = 4;

function TruncatedText(props: { text: string; className?: string }) {
  return <span className={cn("block w-full min-w-0 truncate", props.className)}>{props.text}</span>;
}

function PanelMenuItemContent(props: { icon?: ReactNode; text: string; right?: ReactNode }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {props.icon ? <span className="shrink-0 [&>svg]:size-4">{props.icon}</span> : null}
        <TruncatedText text={props.text} className="min-w-0 flex-1 text-callout" />
      </span>
      {props.right ? (
        <span className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
          {props.right}
        </span>
      ) : null}
    </>
  );
}

function PanelMenuButton(props: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <FloatingPanelButton
      className={cn(
        panelMenuButtonClassName,
        props.disabled && "opacity-60 pointer-events-none cursor-not-allowed",
      )}
      onClick={props.disabled ? undefined : props.onClick}
    >
      {props.children}
    </FloatingPanelButton>
  );
}

export const breadcrumbTriggerClassName = cn(
  "flex items-center gap-1 rounded-md px-1.5 py-0.5",
  "text-label-secondary border-0 bg-transparent hover:bg-accent hover:text-foreground",
  "data-[state=open]:bg-accent data-[state=open]:text-foreground transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const sidebarTriggerShellClassName = cn(
  "group relative",
  "w-full min-w-0",
  "flex items-center gap-0",
  "group-hover:gap-2 group-focus-within:gap-2",
  "overflow-hidden",
  "transition-[gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
);

const sidebarTriggerButtonClassName = cn(
  TRIGGER_HEIGHT_CLASSNAME,
  "min-w-0 flex-1 group-data-[collapsible=icon]:flex-none",
  "!flex !items-center !justify-start gap-2",
  "group-data-[collapsible=icon]:gap-0",
  "rounded-lg !pl-1 !pr-2 !py-1 group-data-[collapsible=icon]:px-0",
  "!border-0",
  "!bg-transparent !text-label-secondary",
  "hover:!bg-accent/40 hover:!text-label-primary",
  "data-[state=open]:!bg-accent/50 data-[state=open]:!text-foreground",
  "transition-[color,background-color,transform,box-shadow,width,height,padding,margin,gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
  "!text-left",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center",
);

const collapseButtonBaseClassName = cn(
  TRIGGER_HEIGHT_CLASSNAME,
  "!border-0 !bg-transparent !text-label-secondary",
  "hover:!bg-accent/40 hover:!text-label-primary",
  "active:!bg-accent/50 active:!text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const collapseButtonClassName = cn(
  collapseButtonBaseClassName,
  "w-0 shrink-0 overflow-hidden rounded-lg !p-0",
  "opacity-0 pointer-events-none",
  "transition-[width,opacity,color,background-color] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
  "group-hover:w-10 group-hover:opacity-100 group-hover:pointer-events-auto",
  "group-data-[collapsible=icon]:w-0",
  "group-data-[collapsible=icon]:opacity-0",
  "group-data-[collapsible=icon]:pointer-events-none",
);

const collapsedCollapseButtonClassName = cn(
  collapseButtonBaseClassName,
  "w-10",
  "rounded-lg !p-0",
  "transition-[color,background-color,transform] duration-200 ease-out motion-reduce:transition-none",
);

const panelMenuButtonClassName = cn(
  "group",
  "transition-colors",
  "hover:bg-accent hover:text-primary-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
);

// ============================================================================
// Types
// ============================================================================

type OrganizationOption = {
  id: string;
  name: string;
  logoUrl: string | null;
  memberCount: number;
};

// ============================================================================
// Collapse Button Components
// ============================================================================

function CollapseButton(props: { ariaLabel: string; onClick: () => void; className?: string }) {
  return (
    <Button
      htmlType="button"
      type="text"
      autoInsertSpace={false}
      className={cn(collapseButtonClassName, props.className)}
      aria-label={props.ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      <PanelLeftIcon className="mx-auto size-4" aria-hidden="true" />
    </Button>
  );
}

function CollapsedCollapseButton(props: { ariaLabel: string; onClick: () => void }) {
  return (
    <Button
      htmlType="button"
      type="text"
      autoInsertSpace={false}
      className={collapsedCollapseButtonClassName}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
    >
      <PanelLeftIcon className="mx-auto size-4" aria-hidden="true" />
    </Button>
  );
}

// ============================================================================
// Section Components
// ============================================================================

function OrgHeaderSection(props: { name: string; logoUrl: string | null; memberCount: number }) {
  const { t } = useTranslation(["common", "nav"]);

  return (
    <div className="mb-3 flex items-start gap-3">
      <OrganizationAvatar
        name={props.name}
        assetRef={props.logoUrl}
        size={40}
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TruncatedText text={props.name} className="text-headline text-label-primary" />
        <div className="mt-1 flex items-center gap-1.5 text-callout text-label-secondary">
          <Users className="h-3 w-3" aria-hidden="true" />
          <span>
            {t("common:WORKSPACE_SWITCHER_ORG_MEMBERS_COUNT", { count: props.memberCount })}
          </span>
        </div>
      </div>
    </div>
  );
}

function OrgActionsSection(props: { onMembers: () => void; onSettings: () => void }) {
  const { t } = useTranslation(["common", "nav"]);

  return (
    <div className="flex items-center gap-2">
      <Button
        htmlType="button"
        type="text"
        size="small"
        autoInsertSpace={false}
        icon={<Settings className="h-3.5 w-3.5" aria-hidden="true" />}
        className="font-medium"
        onClick={props.onSettings}
      >
        {t("common:WORKSPACE_SWITCHER_ORG_SETTINGS")}
      </Button>
      <Button
        htmlType="button"
        type="text"
        size="small"
        autoInsertSpace={false}
        icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />}
        className="font-medium"
        onClick={props.onMembers}
      >
        {t("nav:NAV_ORG_MEMBERS")}
      </Button>
    </div>
  );
}

function OrgPickerSection(props: {
  organizations: readonly OrganizationOption[];
  selectedOrgId: string | null;
  onSelect: (orgId: string) => void;
}) {
  const { t } = useTranslation(["common"]);

  if (props.organizations.length === 0) {
    return (
      <div className="text-callout text-label-secondary">
        {t("common:WORKSPACE_SWITCHER_ORG_EMPTY")}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="px-2 py-1.5 text-callout text-label-secondary">
        {t("common:WORKSPACE_SWITCHER_SELECT_ORG")}
      </div>
      <div className="flex flex-col gap-1">
        {props.organizations.map((org) => {
          const selected = props.selectedOrgId === org.id;
          return (
            <PanelMenuButton key={org.id} onClick={() => props.onSelect(org.id)}>
              <PanelMenuItemContent
                icon={
                  <OrganizationAvatar
                    name={org.name}
                    assetRef={org.logoUrl}
                    size={24}
                    className="shrink-0"
                  />
                }
                text={org.name}
                right={
                  selected ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null
                }
              />
            </PanelMenuButton>
          );
        })}
      </div>
    </div>
  );
}

function WorkspacePickerSection(props: {
  workspaces: readonly OrganizationWorkspace[];
  activeWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
  onCreate: () => void;
  canCreate: boolean;
}) {
  const { t } = useTranslation(["common"]);

  return (
    <div className="min-w-0">
      <div className="px-2 py-1.5 text-callout text-label-secondary">
        {t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE")}
      </div>
      <div className="flex flex-col gap-1">
        {props.workspaces.length === 0 ? (
          <div className="px-2 py-1.5 text-callout text-label-secondary">
            {t("common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY")}
          </div>
        ) : null}
        {props.workspaces.map((ws) => {
          const selected = String(props.activeWorkspaceId || "") === String(ws.workspaceId);
          return (
            <PanelMenuButton key={ws.workspaceId} onClick={() => props.onSelect(ws.workspaceId)}>
              <PanelMenuItemContent
                icon={
                  <WorkspaceAvatar
                    name={ws.name || ws.slug || ws.workspaceId}
                    assetRef={ws.iconUrl}
                    size={24}
                    className="shrink-0"
                  />
                }
                text={ws.name || ws.slug || ws.workspaceId}
                right={
                  selected ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null
                }
              />
            </PanelMenuButton>
          );
        })}
        <PanelMenuButton disabled={!props.canCreate} onClick={props.onCreate}>
          <PanelMenuItemContent
            icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            text={t("common:WORKSPACE_SWITCHER_CREATE")}
          />
        </PanelMenuButton>
      </div>
    </div>
  );
}

function PanelErrorMessage(props: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-2 py-6",
        "text-body text-label-secondary text-center",
        props.className,
      )}
    >
      {props.message}
    </div>
  );
}

function PanelSkeletonRow(props: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("h-4 rounded-md bg-accent/50 animate-pulse", props.className)}
    />
  );
}

function PanelHeaderSkeleton() {
  return (
    <div className="p-3">
      <div className="mb-3 flex items-start gap-3">
        <div aria-hidden="true" className="h-10 w-10 shrink-0 rounded bg-accent/50 animate-pulse" />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PanelSkeletonRow className="w-40" />
          <div className="mt-2 flex items-center gap-2">
            <div aria-hidden="true" className="h-3 w-3 rounded bg-accent/30 animate-pulse" />
            <PanelSkeletonRow className="h-3 w-24" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div aria-hidden="true" className="h-8 rounded bg-accent/50 animate-pulse" />
        <div aria-hidden="true" className="h-8 rounded bg-accent/50 animate-pulse" />
      </div>
    </div>
  );
}

function PanelPickerSkeleton(props: { rows: number }) {
  return (
    <div className="px-2 py-2">
      <div className="flex flex-col gap-2">
        {Array.from({ length: props.rows }).map((_, idx) => (
          <div
            key={idx}
            className={cn(
              "flex w-full items-center gap-2 rounded-none px-4 py-2 text-left text-footnote",
              panelMenuButtonClassName,
              "pointer-events-none",
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                aria-hidden="true"
                className="h-6 w-6 shrink-0 rounded bg-accent/50 animate-pulse"
              />
              <PanelSkeletonRow className="w-40" />
            </div>
            <div
              aria-hidden="true"
              className="h-4 w-4 shrink-0 rounded bg-accent/30 animate-pulse"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Panel Content Component
// ============================================================================

function PanelContentInner() {
  const { t } = useTranslation(["common"]);
  const { isOpen, closeFloatingPanel } = useFloatingPanel();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [orgIdOverride, setOrgIdOverride] = useState<string | null>(null);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", currentWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && currentWorkspaceId),
    queryFn: async () => getWorkspaceDetail(String(currentWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceOrganizationId = workspaceDetailQuery.data?.organizationId ?? null;

  const organizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "scope-switcher", sessionVersion],
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
        logoUrl: item.organization.logoUrl ?? null,
        memberCount: item.memberCount,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [organizationsQuery.data?.items]);

  const effectiveOrgId = orgIdOverride ?? workspaceOrganizationId ?? organizations[0]?.id ?? null;
  const effectiveOrg = effectiveOrgId
    ? (organizations.find((item) => item.id === effectiveOrgId) ?? null)
    : null;

  const workspacesQuery = useQuery({
    queryKey: ["organization", "workspaces", "list", effectiveOrgId, sessionVersion],
    enabled: Boolean(accessToken && effectiveOrgId),
    queryFn: async () =>
      listOrganizationWorkspaces({
        organizationId: effectiveOrgId ?? undefined,
        page: 1,
        size: 20,
        archived: false,
        enterableOnly: true,
        ordering: "name",
      }),
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const enterableWorkspaces = useMemo(
    () => (workspacesQuery.data?.items ?? []).filter((ws) => ws.enterable && !ws.isArchived),
    [workspacesQuery.data?.items],
  );
  const showOrganizationPicker =
    organizationsQuery.isLoading || organizationsQuery.isError || organizations.length > 1;

  useEffect(() => {
    if (!isOpen) setOrgIdOverride(null);
  }, [isOpen]);

  const divider = <div className="h-px bg-border/60" />;

  return (
    <div className="max-w-100">
      {organizationsQuery.isLoading ? (
        <PanelHeaderSkeleton />
      ) : (
        <div className="p-3">
          {workspaceDetailQuery.isError ? (
            <PanelErrorMessage
              message={t("common:REQUEST_FAILED")}
              className="mb-2 rounded-md bg-accent/30 px-2 py-2"
            />
          ) : null}

          {organizationsQuery.isError ? (
            <PanelErrorMessage message={t("common:REQUEST_FAILED")} className="py-8" />
          ) : effectiveOrg ? (
            <>
              <OrgHeaderSection
                name={effectiveOrg.name}
                logoUrl={effectiveOrg.logoUrl}
                memberCount={effectiveOrg.memberCount}
              />
              <OrgActionsSection
                onMembers={() => {
                  closeFloatingPanel();
                  void navigate({
                    to: buildOrganizationPath(effectiveOrg.id, "/team/members") as never,
                  });
                }}
                onSettings={() => {
                  closeFloatingPanel();
                  void navigate({
                    to: buildOrganizationPath(effectiveOrg.id, "/settings") as never,
                  });
                }}
              />
            </>
          ) : (
            <div className="text-caption text-label-secondary">
              {t("common:WORKSPACE_SWITCHER_ORG_EMPTY")}
            </div>
          )}
        </div>
      )}

      {divider}

      {showOrganizationPicker ? (
        <>
          <div className="py-1.5">
            {organizationsQuery.isError ? (
              <PanelErrorMessage message={t("common:REQUEST_FAILED")} />
            ) : organizationsQuery.isLoading ? (
              <PanelPickerSkeleton rows={4} />
            ) : (
              <OrgPickerSection
                organizations={organizations}
                selectedOrgId={effectiveOrgId}
                onSelect={(orgId) => setOrgIdOverride(orgId)}
              />
            )}
          </div>

          {divider}
        </>
      ) : null}

      <div className="py-1.5">
        {workspacesQuery.isError ? (
          <PanelErrorMessage message={t("common:REQUEST_FAILED")} />
        ) : workspacesQuery.isLoading ? (
          <PanelPickerSkeleton rows={4} />
        ) : (
          <WorkspacePickerSection
            workspaces={enterableWorkspaces}
            activeWorkspaceId={currentWorkspaceId}
            onSelect={(nextWorkspaceId) => {
              closeFloatingPanel();
              setCurrentWorkspaceId(nextWorkspaceId);
              const nextPath = switchWorkspacePath({
                pathname,
                currentWorkspaceId,
                nextWorkspaceId,
              });
              void navigate({ to: nextPath as never });
            }}
            canCreate={Boolean(effectiveOrgId)}
            onCreate={() => {
              if (!effectiveOrgId) return;
              closeFloatingPanel();
              void navigate({
                to: `${buildOrganizationPath(effectiveOrgId, "/workspaces/")}?create=1` as never,
              });
            }}
          />
        )}
      </div>

      {divider}

      <div className="py-1.5">
        <PanelMenuButton
          disabled={!effectiveOrgId}
          onClick={() => {
            if (!effectiveOrgId) return;
            closeFloatingPanel();
            void navigate({
              to: buildOrganizationPath(effectiveOrgId, "/") as never,
            });
          }}
        >
          <PanelMenuItemContent
            icon={<Compass className="h-4 w-4" aria-hidden="true" />}
            text={t("common:WORKSPACE_SWITCHER_EXPLORE_ORG_OVERVIEW")}
          />
        </PanelMenuButton>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AdminWorkspaceSwitcher(props: { className?: string } = {}) {
  const { t } = useTranslation(["common"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const { toggleSidebar } = useSidebar();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", currentWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && currentWorkspaceId),
    queryFn: async () => getWorkspaceDetail(String(currentWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceOrganizationId = workspaceDetailQuery.data?.organizationId ?? null;
  const triggerOrganizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "scope-switcher", sessionVersion],
    enabled: Boolean(accessToken && workspaceOrganizationId),
    queryFn: listMyOrganizations,
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });
  const triggerOrganizationLogoUrl = useMemo(() => {
    if (!workspaceOrganizationId) return null;
    const organizations = triggerOrganizationsQuery.data?.items ?? [];
    const currentOrganization = organizations.find(
      (item) => item.organization.id === workspaceOrganizationId,
    );
    return currentOrganization?.organization.logoUrl ?? null;
  }, [triggerOrganizationsQuery.data?.items, workspaceOrganizationId]);

  const workspaceName = workspaceDetailQuery.data?.name ?? "";
  const isWorkspaceScopeRoute = pathname.startsWith("/w/");

  if (!isWorkspaceScopeRoute) {
    const backLabel = t("common:WORKSPACE_SWITCHER_BACK_TO_WORKSPACE");
    const effectiveBackWorkspaceId = currentWorkspaceId ?? lastWorkspaceId ?? null;
    const canGoBack = Boolean(effectiveBackWorkspaceId);

    return (
      <TooltipProvider>
        <div className={cn("w-full min-w-0", props.className)}>
          <div
            className={cn(
              sidebarTriggerShellClassName,
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
            )}
          >
            <Tooltip side="bottom" sideOffset={DEFAULT_TOOLTIP_SIDE_OFFSET}>
              <TooltipTrigger asChild>
                <Button
                  type="text"
                  autoInsertSpace={false}
                  aria-label={backLabel}
                  className={cn(
                    sidebarTriggerButtonClassName,
                    !canGoBack && "opacity-60",
                    "group-data-[collapsible=icon]:!justify-center",
                  )}
                  disabled={!canGoBack}
                  onClick={() => {
                    if (!effectiveBackWorkspaceId) return;
                    setCurrentWorkspaceId(effectiveBackWorkspaceId);
                    void navigate({
                      to: `${workspaceHomePath(effectiveBackWorkspaceId)}/` as never,
                    });
                  }}
                >
                  <ArrowLeft
                    className={cn(
                      "size-4 shrink-0 opacity-70",
                      "group-data-[collapsible=icon]:opacity-100",
                    )}
                    aria-hidden="true"
                  />
                  <div
                    className={cn(
                      "min-w-0 flex-1",
                      NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
                      "group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none",
                    )}
                  >
                    <TruncatedText
                      text={backLabel}
                      className="text-callout font-semibold text-foreground"
                    />
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{backLabel}</TooltipContent>
            </Tooltip>

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
            <CollapsedCollapseButton
              ariaLabel={t("common:SIDEBAR_TOGGLE")}
              onClick={toggleSidebar}
            />
          </div>
        </div>
      </TooltipProvider>
    );
  }

  const canOpenPanel = Boolean(accessToken);
  const label = t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE");
  const workspaceTriggerText = workspaceName || label;

  return (
    <FloatingPanelRoot className={cn("w-full min-w-0", props.className)}>
      <TooltipProvider>
        <div className="min-w-0">
          <div
            className={cn(
              sidebarTriggerShellClassName,
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
            )}
          >
            <div className="min-w-0 flex-1 overflow-hidden">
              <FloatingPanelTrigger
                title={workspaceTriggerText}
                aria-label={label}
                className={cn(
                  sidebarTriggerButtonClassName,
                  "w-full max-w-full overflow-hidden",
                  !canOpenPanel && "opacity-60",
                )}
                disabled={!canOpenPanel}
              >
                <OrganizationAvatar
                  name={workspaceTriggerText}
                  assetRef={triggerOrganizationLogoUrl}
                  size={32}
                  className="shrink-0"
                />

                <div
                  className={cn(
                    "min-w-0 flex-1 overflow-hidden",
                    NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
                    "group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none",
                  )}
                >
                  <TruncatedText
                    text={workspaceTriggerText}
                    className="text-callout font-semibold text-foreground"
                  />
                </div>

                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 opacity-70 transition-opacity group-hover:opacity-100",
                    NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
                  )}
                  aria-hidden="true"
                />
              </FloatingPanelTrigger>
            </div>

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
            <CollapsedCollapseButton
              ariaLabel={t("common:SIDEBAR_TOGGLE")}
              onClick={toggleSidebar}
            />
          </div>
        </div>

        <FloatingPanelContent placement="bottom" offset={8} showTitle={false} className="p-0">
          <PanelContentInner />
        </FloatingPanelContent>
      </TooltipProvider>
    </FloatingPanelRoot>
  );
}
