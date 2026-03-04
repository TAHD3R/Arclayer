import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Avatar, Button } from "antd";
import { ChevronDown, PanelLeftIcon, Settings, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listMyOrganizations } from "@/api/me";
import { getWorkspaceDetail } from "@/api/workspaces";
import {
  buildOrganizationPath,
  parseOrganizationIdFromPath,
} from "@/lib/routing/organization-routing";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { MyOrganizationMemberPreview } from "@/types/api";
import { cn } from "@celestial/lib/utils";
import { useSidebar } from "@celestial/ui/sidebar";
import {
  DropdownCardBody,
  DropdownCardContent,
  DropdownCardHeader,
  DropdownCardRoot,
  DropdownCardTrigger,
} from "@celestial/ui/dropdown-card";
import { RadioGroup, RadioGroupItem } from "@celestial/ui/radio-group";

import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";

type OrganizationOption = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  membersPreview: MyOrganizationMemberPreview[];
};

function firstLetter(input: string): string {
  const text = String(input || "").trim();
  if (!text) return "?";
  return text.slice(0, 1).toUpperCase();
}

function OrgMembersPreview(props: {
  memberCount: number;
  membersPreview: readonly MyOrganizationMemberPreview[];
  onMembersClick?: () => void;
}) {
  const { t } = useTranslation(["common"]);
  const membersLabel = t("common:WORKSPACE_SWITCHER_ORG_MEMBERS_COUNT", {
    count: props.memberCount,
  });
  return (
    <div className="mt-2 flex items-center gap-2">
      {props.membersPreview.length > 0 ? (
        props.onMembersClick ? (
          <button
            type="button"
            aria-label={membersLabel}
            onClick={props.onMembersClick}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          >
            <Avatar.Group
              max={{ count: 3, style: { backgroundColor: "var(--color-primary)", fontSize: 12 } }}
              size="small"
            >
              {props.membersPreview.map((member) => (
                <Avatar key={member.userId} src={member.avatarUrl ?? undefined}>
                  {(member.displayName || member.username || "U").slice(0, 1).toUpperCase()}
                </Avatar>
              ))}
            </Avatar.Group>
          </button>
        ) : (
          <div aria-hidden="true">
            <Avatar.Group
              max={{ count: 3, style: { backgroundColor: "var(--color-primary)", fontSize: 12 } }}
              size="small"
            >
              {props.membersPreview.map((member) => (
                <Avatar key={member.userId} src={member.avatarUrl ?? undefined}>
                  {(member.displayName || member.username || "U").slice(0, 1).toUpperCase()}
                </Avatar>
              ))}
            </Avatar.Group>
          </div>
        )
      ) : null}
      <span className="text-caption text-label-secondary">{membersLabel}</span>
    </div>
  );
}

function OrgHeaderSection(props: {
  name: string;
  memberCount: number;
  membersPreview: readonly MyOrganizationMemberPreview[];
  onInvite: () => void;
  onSettings: () => void;
  onMembersClick?: () => void;
}) {
  const { t } = useTranslation(["common", "nav"]);

  return (
    <div className="flex items-start gap-3">
      <Avatar size={40} className="shrink-0 rounded-xl">
        {firstLetter(props.name)}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-caption font-semibold text-foreground">{props.name}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="small"
              type="primary"
              icon={<UserPlus className="size-4" aria-hidden="true" />}
              aria-label={t("common:ORG_MEMBERS_INVITE")}
              onClick={props.onInvite}
              autoInsertSpace={false}
            />
            <Button
              size="small"
              type="text"
              icon={<Settings className="size-4" aria-hidden="true" />}
              aria-label={t("nav:NAV_ORG_SETTINGS")}
              onClick={props.onSettings}
              autoInsertSpace={false}
            />
          </div>
        </div>
        <OrgMembersPreview
          memberCount={props.memberCount}
          membersPreview={props.membersPreview}
          onMembersClick={props.onMembersClick}
        />
      </div>
    </div>
  );
}

function OrgListSection(props: {
  organizations: readonly OrganizationOption[];
  selectedOrgId: string | null;
  onSelect: (orgId: string) => void;
}) {
  return (
    <RadioGroup
      value={props.selectedOrgId ?? ""}
      onValueChange={(orgId) => props.onSelect(orgId)}
      className="gap-1"
    >
      {props.organizations.map((org) => (
        <label
          key={org.id}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2",
            "text-callout text-label-secondary",
            "hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <RadioGroupItem value={org.id} className="mt-0.5" aria-label={org.name} />
          <Avatar shape="square" size={22} className="shrink-0 rounded-md bg-muted text-foreground">
            {firstLetter(org.name)}
          </Avatar>
          <span className="min-w-0 flex-1 truncate">{org.name}</span>
        </label>
      ))}
    </RadioGroup>
  );
}

function resolveSelectedOrg(args: {
  organizations: readonly OrganizationOption[];
  routeOrganizationId: string | null;
  workspaceOrganizationId: string | null;
}): OrganizationOption | null {
  if (args.organizations.length === 0) return null;
  if (args.routeOrganizationId) {
    const matched = args.organizations.find((item) => item.id === args.routeOrganizationId);
    if (matched) return matched;
  }
  if (args.workspaceOrganizationId) {
    const matched = args.organizations.find((item) => item.id === args.workspaceOrganizationId);
    if (matched) return matched;
  }
  return args.organizations[0] ?? null;
}

const TRIGGER_HEIGHT_CLASSNAME = "h-10";

const triggerShellClassName = cn(
  "group relative",
  "w-full min-w-0",
  "flex items-center gap-0",
  "group-hover:gap-2 group-focus-within:gap-2",
  "transition-[gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
);

const triggerButtonClassName = cn(
  "group/org-switcher",
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

export function OrgContextPanel(props: { className?: string }) {
  const { t } = useTranslation(["common"]);
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { toggleSidebar } = useSidebar();
  const [open, setOpen] = useState(false);

  const isWorkspaceScopeRoute = pathname.startsWith("/w/");

  const organizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "org-context-panel", sessionVersion],
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
        memberCount: item.memberCount,
        membersPreview: item.membersPreview,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [organizationsQuery.data?.items]);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", currentWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && currentWorkspaceId && isWorkspaceScopeRoute),
    queryFn: async () => getWorkspaceDetail(String(currentWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const routeOrganizationId = parseOrganizationIdFromPath(pathname);
  const selectedOrg = useMemo(
    () =>
      resolveSelectedOrg({
        organizations,
        routeOrganizationId,
        workspaceOrganizationId: workspaceDetailQuery.data?.organizationId ?? null,
      }),
    [organizations, routeOrganizationId, workspaceDetailQuery.data?.organizationId],
  );

  const selectedOrgId = selectedOrg?.id ?? null;
  const selectedOrgName = selectedOrg?.name ?? t("common:WORKSPACE_SWITCHER_SELECT_ORG");

  const onNavigate = (to: string) => {
    setOpen(false);
    void navigate({ to: to as never });
  };

  return (
    <DropdownCardRoot open={open} onOpenChange={setOpen}>
      <div className={cn("w-full min-w-0", props.className)}>
        <div
          className={cn(
            triggerShellClassName,
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
          )}
        >
          <DropdownCardTrigger asChild>
            <button
              type="button"
              aria-label={t("common:WORKSPACE_SWITCHER_SELECT_ORG")}
              data-state={open ? "open" : "closed"}
              className={triggerButtonClassName}
            >
              <Avatar size={32} className="shrink-0 rounded-md">
                {firstLetter(selectedOrgName)}
              </Avatar>

              <div
                className={cn(
                  "min-w-0 flex-1",
                  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
                  "group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none",
                )}
              >
                <div className="truncate text-callout font-semibold text-foreground">
                  {selectedOrgName}
                </div>
              </div>

              <ChevronDown
                className={cn(
                  "size-4 shrink-0 opacity-70 transition-opacity group-hover:opacity-100",
                  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
                )}
                aria-hidden="true"
              />
            </button>
          </DropdownCardTrigger>

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

      <DropdownCardContent side="bottom" align="start" sideOffset={8} className="w-[360px]">
        <DropdownCardHeader>
          {organizationsQuery.isError ? (
            <div className="py-2">
              <div className="text-callout font-medium text-foreground">
                {t("common:REQUEST_FAILED")}
              </div>
            </div>
          ) : selectedOrg ? (
            <OrgHeaderSection
              name={selectedOrg.name}
              memberCount={selectedOrg.memberCount}
              membersPreview={selectedOrg.membersPreview}
              onInvite={() =>
                onNavigate(buildOrganizationPath(selectedOrg.id, "/team/invitations"))
              }
              onSettings={() => onNavigate(buildOrganizationPath(selectedOrg.id, "/settings"))}
              onMembersClick={() =>
                onNavigate(buildOrganizationPath(selectedOrg.id, "/team/members"))
              }
            />
          ) : (
            <div className="text-label-secondary">{t("common:WORKSPACE_SWITCHER_ORG_EMPTY")}</div>
          )}
        </DropdownCardHeader>

        <DropdownCardBody>
          {organizationsQuery.isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
          ) : organizations.length === 0 ? null : (
            <OrgListSection
              organizations={organizations}
              selectedOrgId={selectedOrgId}
              onSelect={(orgId) => onNavigate(buildOrganizationPath(orgId))}
            />
          )}
        </DropdownCardBody>
      </DropdownCardContent>
    </DropdownCardRoot>
  );
}
