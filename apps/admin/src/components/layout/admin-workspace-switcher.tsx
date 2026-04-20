import { type ReactNode, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  PanelLeftIcon,
  PanelsTopLeft,
  Plus,
  Settings2,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { getWorkspaceDetail, listMyWorkspaces } from "@/api/workspaces";
import {
  UserAvatar,
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
  type WorkspaceAvatarIdentity,
} from "@/components/common/entity-avatar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import { buildUsercenterOverlayNavigate } from "@/lib/routing/usercenter-overlay";
import { projectsHomePath } from "@/lib/routing/workspace-routing";
import {
  WorkspaceCreateDialog,
  type CreateWorkspaceFormValues,
} from "@/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs";
import { useUserCenterWorkspacesMutations } from "@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-mutations";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { MyWorkspace } from "@/types/api";
import { AvatarGroup, AvatarGroupCount } from "@arclayer/ui/avatar";
import { cn } from "@arclayer/lib/utils";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@arclayer/ui/floating-panel";
import { Button } from "@arclayer/ui/button";
import { useSidebar } from "@arclayer/ui/sidebar";

const SIDEBAR_TRIGGER_HEIGHT_CLASSNAME = "!h-10";
const HEADER_TRIGGER_HEIGHT_CLASSNAME = "!h-10";
const INTERACTION_EASING = "ease-[cubic-bezier(0.22,1,0.36,1)]";
const WORKSPACE_PICKER_VISIBLE_ROWS = 5;
const WORKSPACE_PICKER_ITEM_MIN_HEIGHT_REM = 4.5;
const WORKSPACE_PICKER_SECTION_VERTICAL_PADDING_REM = 0.5;
const WORKSPACE_PICKER_MAX_HEIGHT_STYLE = {
  maxHeight: `min(calc(${WORKSPACE_PICKER_VISIBLE_ROWS} * ${WORKSPACE_PICKER_ITEM_MIN_HEIGHT_REM}rem + ${WORKSPACE_PICKER_SECTION_VERTICAL_PADDING_REM}rem), calc(100vh - 15rem))`,
} as const;
const INTERACTION_TRANSITION_CLASSNAME = cn(
  "transition-[background-color,color,transform,opacity]",
  "duration-200",
  INTERACTION_EASING,
  "motion-reduce:transition-none",
);
function TruncatedText(props: { text: string; className?: string }) {
  return <span className={cn("block w-full min-w-0 truncate", props.className)}>{props.text}</span>;
}

function ClampedText(props: { text: string; className?: string }) {
  return (
    <span className={cn("block min-w-0 overflow-hidden text-ellipsis", props.className)}>
      {props.text}
    </span>
  );
}

function PanelMenuItemContent(props: {
  icon?: ReactNode;
  text: string;
  right?: ReactNode;
  textClassName?: string;
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {props.icon ? <span className="shrink-0 [&>svg]:size-4">{props.icon}</span> : null}
        <ClampedText
          text={props.text}
          className={cn("min-w-0 flex-1 text-callout ", props.textClassName)}
        />
      </span>
      {props.right ? (
        <span className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
          {props.right}
        </span>
      ) : null}
    </>
  );
}

const panelMenuButtonClassName = cn(
  "group",
  "min-h-11 rounded-xl",
  "text-label-secondary",
  INTERACTION_TRANSITION_CLASSNAME,
  "hover:bg-accent/80 hover:text-label-primary",
  "active:scale-[0.992]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
);

function PanelMenuButton(props: {
  onClick?: () => void;
  children: ReactNode | ((state: { isHovered: boolean }) => ReactNode);
  disabled?: boolean;
  className?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <FloatingPanelButton
      className={cn(
        panelMenuButtonClassName,
        props.disabled && "opacity-60 pointer-events-none cursor-not-allowed",
        props.className,
      )}
      onClick={props.disabled ? undefined : props.onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {typeof props.children === "function" ? props.children({ isHovered }) : props.children}
    </FloatingPanelButton>
  );
}

export const breadcrumbTriggerClassName = cn(
  "flex items-center gap-1 rounded-md px-1.5 py-0.5",
  "text-label-secondary border-0 bg-transparent hover:bg-accent hover:text-label-primary",
  "data-[state=open]:bg-accent data-[state=open]:text-label-primary transition-colors",
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
  SIDEBAR_TRIGGER_HEIGHT_CLASSNAME,
  "group/panel-trigger",
  "min-w-0 flex-1 group-data-[collapsible=icon]:flex-none",
  "!flex !items-center !justify-start gap-2",
  "group-data-[collapsible=icon]:gap-0",
  "rounded-lg !pl-1 !pr-2 !py-1 group-data-[collapsible=icon]:px-0",
  "!border-0",
  "!bg-transparent !text-label-secondary",
  "hover:!bg-accent/40 hover:!text-label-primary",
  "data-[state=open]:!bg-accent/50 data-[state=open]:!text-label-primary",
  "transition-[color,background-color,transform,box-shadow,width,height,padding,margin,gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
  "!text-left",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center",
);

export const headerTriggerButtonClassName = cn(
  HEADER_TRIGGER_HEIGHT_CLASSNAME,
  "group/panel-trigger",
  "inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-transparent",
  "bg-transparent px-2 text-label-secondary ",
  "transition-[border-color,background-color,color] duration-200",
  "hover:bg-accent/60 hover:text-label-primary",
  "data-[state=open]:border-border/60 data-[state=open]:bg-accent/70 data-[state=open]:text-label-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const collapseButtonBaseClassName = cn(
  SIDEBAR_TRIGGER_HEIGHT_CLASSNAME,
  "!border-0 !bg-transparent !text-label-secondary",
  "hover:!bg-accent/40 hover:!text-label-primary",
  "active:!bg-accent/50 active:!text-label-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const collapseButtonClassName = cn(
  "group",
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
  "group",
  collapseButtonBaseClassName,
  "w-10",
  "rounded-lg !p-0",
  "transition-[color,background-color,transform] duration-200 ease-out motion-reduce:transition-none",
);

function CollapseButton(props: { ariaLabel: string; onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(collapseButtonClassName, props.className)}
      aria-label={props.ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
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
      type="button"
      variant="ghost"
      size="icon"
      className={collapsedCollapseButtonClassName}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
    >
      <PanelLeftIcon className="mx-auto size-4" aria-hidden="true" />
    </Button>
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

function PanelPickerSkeleton(props: { rows: number }) {
  return (
    <div className="px-2 py-2">
      <div className="flex flex-col gap-2">
        {Array.from({ length: props.rows }).map((_, index) => (
          <div
            key={index}
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

function WorkspaceMemberMeta(props: { workspace: MyWorkspace }) {
  const { t } = useTranslation(["common"]);
  const memberCount = Math.max(0, props.workspace.memberCount ?? 0);
  const membersPreview = props.workspace.membersPreview ?? [];
  const visibleMembers = membersPreview.slice(0, 3);
  const hiddenMemberCount = Math.max(0, memberCount - visibleMembers.length);

  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-2 text-footnote text-label-secondary">
      {visibleMembers.length > 0 ? (
        <AvatarGroup className="shrink-0">
          {visibleMembers.map((member) => (
            <UserAvatar
              key={member.userId}
              name={member.displayName || member.username || "U"}
              assetRef={member.avatarUrl}
              size={20}
              className="ring-2 ring-background"
            />
          ))}
          {hiddenMemberCount > 0 ? (
            <AvatarGroupCount className="size-5 bg-muted text-footnote text-label-secondary">
              +{hiddenMemberCount}
            </AvatarGroupCount>
          ) : null}
        </AvatarGroup>
      ) : null}
      <span className="min-w-0 truncate ">
        {t("common:ORG_WORKSPACES_MEMBERS_COUNT", { count: memberCount })}
      </span>
    </div>
  );
}

function WorkspacePickerItemContent(props: { workspace: MyWorkspace; selected: boolean }) {
  const title = props.workspace.name || props.workspace.workspaceId;

  return (
    <>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <WorkspaceAvatar
          name={title}
          size={28}
          className="mt-0.5 shrink-0"
          {...workspaceAvatarPropsFromIdentity(props.workspace)}
        />
        <div className="min-w-0 flex-1 text-left">
          <ClampedText
            text={title}
            className="truncate text-callout font-semibold  text-label-primary"
          />
          <WorkspaceMemberMeta workspace={props.workspace} />
        </div>
      </div>
      {props.selected ? (
        <span className="shrink-0 pt-0.5 opacity-90">
          <Check className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
}

function WorkspacePickerSection(props: {
  title?: string | null;
  workspaces: readonly MyWorkspace[];
  activeWorkspaceId: string | null;
  onSelect: (workspace: MyWorkspace) => void;
}) {
  const { t } = useTranslation(["common"]);
  const shouldScroll = props.workspaces.length > WORKSPACE_PICKER_VISIBLE_ROWS;

  return (
    <div className="min-w-0">
      {props.title ? (
        <div className="px-2 py-1.5 text-headline text-label-primary">{props.title}</div>
      ) : null}
      <div
        style={shouldScroll ? WORKSPACE_PICKER_MAX_HEIGHT_STYLE : undefined}
        className={cn(shouldScroll && "overflow-y-auto overscroll-contain")}
      >
        {props.workspaces.length === 0 ? (
          <div className="px-2 py-1.5 text-callout text-label-secondary">
            {t("common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY")}
          </div>
        ) : null}
        {props.workspaces.map((workspace) => {
          const selected = String(props.activeWorkspaceId || "") === String(workspace.workspaceId);
          return (
            <PanelMenuButton
              key={workspace.workspaceId}
              onClick={() => props.onSelect(workspace)}
              className={cn(
                "min-h-[4.5rem] items-start rounded-none px-3 py-2.5",
                selected && "bg-accent/80 text-label-primary",
              )}
            >
              <WorkspacePickerItemContent workspace={workspace} selected={selected} />
            </PanelMenuButton>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceActionButton(props: {
  icon?: ReactNode;
  text: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <PanelMenuButton
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded-none px-3 py-2.5"
    >
      <PanelMenuItemContent
        icon={props.icon}
        text={props.text}
        textClassName=" text-label-primary "
      />
    </PanelMenuButton>
  );
}

function ViewAllWorkspacesButton() {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const { closeFloatingPanel } = useFloatingPanel();

  return (
    <WorkspaceActionButton
      icon={<PanelsTopLeft className="h-4 w-4" aria-hidden="true" />}
      text={t("common:WORKSPACE_SWITCHER_VIEW_ALL_PROJECTS")}
      onClick={() => {
        closeFloatingPanel();
        void navigate({ to: projectsHomePath() as never });
      }}
    />
  );
}

function PanelContentInner(props: { onOpenCreateDialog: () => void }) {
  const { t } = useTranslation(["common", "team"]);
  const { closeFloatingPanel } = useFloatingPanel();
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const currentProjectId = useWorkspaceStore((state) => state.currentProjectId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const lastProjectId = useWorkspaceStore((state) => state.lastProjectId);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const setCurrentProjectId = useWorkspaceStore((state) => state.setCurrentProjectId);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", "switcher", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: listMyWorkspaces,
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const teamWorkspaces = useMemo(
    () =>
      [...(workspacesQuery.data?.switcher.teams ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [workspacesQuery.data?.switcher.teams],
  );
  const pickerWorkspaces = teamWorkspaces;
  const hasWorkspaceItems = pickerWorkspaces.length > 0;

  const effectiveWorkspaceId =
    currentWorkspaceId ??
    (lastWorkspaceId &&
    pickerWorkspaces.some((workspace) => String(workspace.workspaceId) === String(lastWorkspaceId))
      ? lastWorkspaceId
      : null) ??
    pickerWorkspaces[0]?.workspaceId ??
    null;
  const effectiveProjectId =
    currentProjectId ??
    (effectiveWorkspaceId
      ? (pickerWorkspaces.find(
          (workspace) => String(workspace.workspaceId) === String(effectiveWorkspaceId),
        )?.projectId ?? null)
      : null) ??
    lastProjectId;
  const divider = <div className="mx-3 h-px bg-border/45" />;

  return (
    <div className="w-[min(21rem,calc(100vw-1rem))] max-w-full">
      <div className="py-1.5">
        {workspacesQuery.isError ? (
          <PanelErrorMessage message={t("common:REQUEST_FAILED")} />
        ) : workspacesQuery.isLoading ? (
          <PanelPickerSkeleton rows={4} />
        ) : (
          <div className="space-y-1.5">
            {hasWorkspaceItems ? (
              <WorkspacePickerSection
                title={null}
                workspaces={pickerWorkspaces}
                activeWorkspaceId={effectiveWorkspaceId}
                onSelect={(workspace) => {
                  closeFloatingPanel();
                  setCurrentWorkspaceId(workspace.workspaceId);
                  setCurrentProjectId(null);
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      {divider}

      <div className="py-1.5 space-y-1">
        <WorkspaceActionButton
          icon={<Settings2 className="h-4 w-4" aria-hidden="true" />}
          text={t("common:WORKSPACE_SWITCHER_WORKSPACE_SETTINGS")}
          disabled={!effectiveWorkspaceId}
          onClick={() => {
            if (!effectiveWorkspaceId) return;
            if (effectiveProjectId) {
              setCurrentProjectId(effectiveProjectId);
            }
            setCurrentWorkspaceId(effectiveWorkspaceId);
            closeFloatingPanel();
            void navigate(
              buildUsercenterOverlayNavigate({
                currentLocation: { pathname, hash: "" },
                tab: "workspace-general",
              }),
            );
          }}
        />
        {effectiveWorkspaceId ? (
          <WorkspaceActionButton
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
            text={t("team:TEAM_INVITE_MEMBER")}
            disabled={!effectiveWorkspaceId}
            onClick={() => {
              if (!effectiveWorkspaceId) return;
              if (effectiveProjectId) {
                setCurrentProjectId(effectiveProjectId);
              }
              setCurrentWorkspaceId(effectiveWorkspaceId);
              closeFloatingPanel();
              void navigate(
                buildUsercenterOverlayNavigate({
                  currentLocation: { pathname, hash: "" },
                  tab: "workspace-members",
                }),
              );
            }}
          />
        ) : null}
        <ViewAllWorkspacesButton />
      </div>

      {divider}

      <div className="pt-1.5 pb-1">
        <WorkspaceActionButton
          icon={<Plus className="h-4 w-4" aria-hidden="true" />}
          text={t("common:WORKSPACE_SWITCHER_ADD_WORKSPACE")}
          onClick={() => {
            closeFloatingPanel();
            props.onOpenCreateDialog();
          }}
        />
      </div>
    </div>
  );
}

function HeaderWorkspaceTrigger(props: {
  workspaceTriggerText: string;
  workspaceIdentity: WorkspaceAvatarIdentity | null;
  label: string;
  disabled: boolean;
}) {
  const { isOpen } = useFloatingPanel();

  return (
    <FloatingPanelTrigger
      title={props.workspaceTriggerText}
      aria-label={props.label}
      disableLayoutId
      className={cn(headerTriggerButtonClassName, props.disabled && "opacity-60")}
      disabled={props.disabled}
    >
      <WorkspaceAvatar
        name={props.workspaceTriggerText}
        size={28}
        className="shrink-0"
        {...workspaceAvatarPropsFromIdentity(props.workspaceIdentity)}
      />

      <div className="min-w-0 overflow-hidden text-left">
        <TruncatedText
          text={props.workspaceTriggerText}
          className="text-callout font-semibold text-label-primary"
        />
      </div>

      <ChevronDown
        className={cn(
          "size-4 shrink-0 opacity-70 transition-transform duration-200",
          isOpen && "rotate-180",
        )}
        aria-hidden="true"
      />
    </FloatingPanelTrigger>
  );
}

function SidebarWorkspaceTrigger(props: {
  workspaceTriggerText: string;
  workspaceIdentity: WorkspaceAvatarIdentity | null;
  label: string;
  disabled: boolean;
}) {
  const { isOpen } = useFloatingPanel();

  return (
    <FloatingPanelTrigger
      title={props.workspaceTriggerText}
      aria-label={props.label}
      disableLayoutId
      className={cn(
        sidebarTriggerButtonClassName,
        "w-full max-w-full overflow-hidden",
        props.disabled && "opacity-60",
      )}
      disabled={props.disabled}
    >
      <WorkspaceAvatar
        name={props.workspaceTriggerText}
        size={32}
        className="shrink-0"
        {...workspaceAvatarPropsFromIdentity(props.workspaceIdentity)}
      />

      <div
        className={cn(
          "min-w-0 flex-1 overflow-hidden",
          NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
          "group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none",
        )}
      >
        <TruncatedText
          text={props.workspaceTriggerText}
          className="text-callout font-semibold text-label-primary"
        />
      </div>

      <ChevronDown
        className={cn(
          "size-4 shrink-0 opacity-70 transition-transform duration-200",
          NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
          isOpen && "rotate-180",
        )}
        aria-hidden="true"
      />
    </FloatingPanelTrigger>
  );
}

type AdminWorkspaceSwitcherProps = {
  className?: string;
  variant?: "sidebar" | "header";
  showSidebarToggle?: boolean;
};

export function AdminWorkspaceSwitcher({
  className,
  variant = "sidebar",
  showSidebarToggle = true,
}: AdminWorkspaceSwitcherProps = {}) {
  const { t } = useTranslation(["common"]);
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<CreateWorkspaceFormValues>({
    name: "",
    description: "",
  });
  const { toggleSidebar } = useSidebar();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const mutations = useUserCenterWorkspacesMutations({
    organizationId: undefined,
    t,
    onCreateSuccess: () => undefined,
    onArchiveSuccess: () => undefined,
    onDeleteSuccess: () => undefined,
  });

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", currentWorkspaceId ?? lastWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && (currentWorkspaceId || lastWorkspaceId)),
    queryFn: async () => getWorkspaceDetail(String(currentWorkspaceId ?? lastWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const workspaceName = workspaceDetailQuery.data?.name ?? "";
  const workspaceIdentity = workspaceDetailQuery.data ?? null;
  const isWorkspaceScopeRoute =
    pathname.startsWith("/projects/") || pathname === "/projects" || pathname === "/projects/";
  const isHeaderVariant = variant === "header";

  if (!isWorkspaceScopeRoute && !isHeaderVariant) {
    return null;
  }

  const canOpenPanel = Boolean(accessToken);
  const label = t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE");
  const workspaceTriggerText = workspaceName || label;

  if (isHeaderVariant) {
    return (
      <>
        <FloatingPanelRoot className={cn("inline-flex min-w-0 max-w-full", className)}>
          <HeaderWorkspaceTrigger
            workspaceTriggerText={workspaceTriggerText}
            workspaceIdentity={workspaceIdentity}
            label={label}
            disabled={!canOpenPanel}
          />

          <FloatingPanelContent placement="bottom" offset={10} showTitle={false} className="p-0">
            <PanelContentInner onOpenCreateDialog={() => setCreateOpen(true)} />
          </FloatingPanelContent>
        </FloatingPanelRoot>

        <WorkspaceCreateDialog
          t={t}
          createDialog={{
            open: createOpen,
            organizationId: undefined,
            setOpen: setCreateOpen,
            values: createValues,
            setValues: setCreateValues,
            pending: mutations.createMutation.isPending,
            onSubmit: async (values) => {
              await mutations.createMutation.mutateAsync(values);
              setCreateOpen(false);
              setCreateValues({
                name: "",
                description: "",
              });
            },
          }}
        />
      </>
    );
  }

  return (
    <>
      <FloatingPanelRoot className={cn("w-full min-w-0", className)}>
        <div className="min-w-0">
          <div
            className={cn(
              sidebarTriggerShellClassName,
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
            )}
          >
            <SidebarWorkspaceTrigger
              workspaceTriggerText={workspaceTriggerText}
              workspaceIdentity={workspaceIdentity}
              label={label}
              disabled={!canOpenPanel}
            />

            {showSidebarToggle ? (
              <CollapseButton ariaLabel={t("common:SIDEBAR_TOGGLE")} onClick={toggleSidebar} />
            ) : null}
          </div>

          {showSidebarToggle ? (
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
          ) : null}
        </div>

        <FloatingPanelContent placement="bottom" offset={8} showTitle={false} className="p-0">
          <PanelContentInner onOpenCreateDialog={() => setCreateOpen(true)} />
        </FloatingPanelContent>
      </FloatingPanelRoot>

      <WorkspaceCreateDialog
        t={t}
        createDialog={{
          open: createOpen,
          organizationId: undefined,
          setOpen: setCreateOpen,
          values: createValues,
          setValues: setCreateValues,
          pending: mutations.createMutation.isPending,
          onSubmit: async (values) => {
            await mutations.createMutation.mutateAsync(values);
            setCreateOpen(false);
            setCreateValues({
              name: "",
              description: "",
            });
          },
        }}
      />
    </>
  );
}
