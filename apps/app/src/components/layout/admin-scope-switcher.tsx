import {
  type FocusEventHandler,
  type MouseEventHandler,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronRight,
  PanelsTopLeft,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { getProjectDetail, listProjects } from "@/api/projects";
import { getWorkspaceDetail } from "@/api/workspaces";
import {
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
  type WorkspaceAvatarIdentity,
} from "@/components/common/entity-avatar";
import {
  ProjectAvatar,
  projectAvatarPropsFromIdentity,
  type ProjectAvatarIdentity,
} from "@/components/common/project-avatar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import { useWorkspaceScope } from "@/hooks/use-workspace-scope";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import {
  mapProjectToListItem,
  type UserCenterProjectListItem,
} from "@/pages/usercenter/projects/project-list-items";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
  useFloatingPanelBoundary,
} from "@arclayer/ui/floating-panel";
import { Empty, EmptyDescription, EmptyHeader } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";

type Project = Awaited<ReturnType<typeof getProjectDetail>>["project"];

const SIDEBAR_TRIGGER_HEIGHT_CLASSNAME = "!h-10";
const HEADER_TRIGGER_HEIGHT_CLASSNAME = "!h-9";
const INTERACTION_EASING = "ease-[cubic-bezier(0.22,1,0.36,1)]";
const INTERACTION_TRANSITION_CLASSNAME = cn(
  "transition-[background-color,color,transform,opacity]",
  "duration-200",
  INTERACTION_EASING,
  "motion-reduce:transition-none",
);
const GHOST_HOVER_CLASSNAME =
  "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50";
const GHOST_OPEN_CLASSNAME =
  "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground dark:data-[state=open]:bg-accent/50";
const GHOST_SELECTED_CLASSNAME = "bg-accent text-accent-foreground dark:bg-accent/50";
const SUBPANEL_OPEN_DELAY_MS = 80;
const SUBPANEL_CLOSE_DELAY_MS = 120;

type ScopeIdentity =
  | {
      kind: "workspace";
      name: string;
      identity: WorkspaceAvatarIdentity | null;
    }
  | {
      kind: "project";
      name: string;
      identity: ProjectAvatarIdentity | null;
    };

type ScopeProjectItem = Pick<
  UserCenterProjectListItem,
  | "projectId"
  | "workspaceId"
  | "name"
  | "iconMode"
  | "iconColor"
  | "iconGlyph"
  | "iconEmoji"
  | "iconUrl"
  | "enterable"
>;

function sortProjectPickerItems(
  projects: readonly UserCenterProjectListItem[],
): UserCenterProjectListItem[] {
  return [...projects].sort((left, right) => left.name.localeCompare(right.name));
}

function mapProjectDetailToScopeItem(project: Project): ScopeProjectItem {
  return {
    projectId: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    iconMode: project.iconMode,
    iconColor: project.iconColor,
    iconGlyph: project.iconGlyph ?? null,
    iconEmoji: project.iconEmoji ?? null,
    iconUrl: project.iconUrl,
    enterable: project.isActive,
  };
}

function extractRouteProjectId(pathname: string): string | null {
  const match = /^\/projects\/([^/]+)(?:\/|$)/.exec(pathname);
  const projectId = match?.[1]?.trim() ?? "";
  return projectId ? projectId : null;
}

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
          className={cn("min-w-0 flex-1 text-callout", props.textClassName)}
        />
      </span>
      {props.right ? (
        <span className="inline-flex h-4 w-8 shrink-0 items-center justify-center opacity-70 transition-opacity group-hover:opacity-100">
          {props.right}
        </span>
      ) : null}
    </>
  );
}

const panelMenuButtonClassName = cn(
  "group",
  "min-h-10 rounded-xl",
  "!text-callout",
  "text-label-secondary",
  INTERACTION_TRANSITION_CLASSNAME,
  GHOST_HOVER_CLASSNAME,
  "active:scale-[0.992]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
);

function PanelMenuButton(props: {
  onClick?: () => void;
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <FloatingPanelButton
      className={cn(
        panelMenuButtonClassName,
        props.disabled && "opacity-60 pointer-events-none cursor-not-allowed",
        props.className,
      )}
      onClick={props.disabled ? undefined : props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    >
      {props.children}
    </FloatingPanelButton>
  );
}

export const breadcrumbTriggerClassName = cn(
  "flex items-center gap-1 rounded-md px-1.5 py-0.5",
  "text-label-secondary border-0 bg-transparent",
  GHOST_HOVER_CLASSNAME,
  GHOST_OPEN_CLASSNAME,
  "transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const sidebarTriggerShellClassName = cn(
  "group relative",
  "w-full min-w-0",
  "flex items-center gap-0",
  "group-hover:gap-2 group-focus-within:gap-2",
  "data-[panel-open=true]:gap-0",
  "overflow-hidden",
  "transition-[gap] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
);

const sidebarTriggerTextClassName = cn(
  "min-w-0 flex-1 overflow-hidden whitespace-nowrap",
  "transition-[max-width] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
  "[[data-collapsible=icon]:not([data-hover-preview=true])_&]:max-w-0",
  "[[data-collapsible=icon]:not([data-hover-preview=true])_&]:pointer-events-none",
  "[[data-collapsible=icon]:not([data-hover-preview=true])_&]:flex-none",
  "[[data-collapsible=icon]:not([data-hover-preview=true])_&]:w-0",
);

const sidebarTriggerButtonClassName = cn(
  SIDEBAR_TRIGGER_HEIGHT_CLASSNAME,
  "group/panel-trigger",
  "min-w-0 flex-1",
  "!flex !items-center !justify-start gap-2",
  "[[data-collapsible=icon]:not([data-hover-preview=true])_&]:gap-2",
  "rounded-md !pl-1 !pr-3 !py-1",
  "!border-0",
  "!bg-transparent !text-label-secondary",
  "hover:!bg-accent hover:!text-accent-foreground dark:hover:!bg-accent/50",
  "data-[state=open]:!bg-accent data-[state=open]:!text-accent-foreground dark:data-[state=open]:!bg-accent/50",
  "transition-[color,background-color,transform,box-shadow,width,height,padding,margin,gap] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
  "!text-left",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "[[data-collapsible=icon]:not([data-hover-preview=true])_&]:w-full",
);

export const headerTriggerButtonClassName = cn(
  HEADER_TRIGGER_HEIGHT_CLASSNAME,
  "group/panel-trigger",
  "inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-transparent",
  "bg-transparent px-2 text-label-secondary",
  "transition-[border-color,background-color,color] duration-200",
  GHOST_HOVER_CLASSNAME,
  "data-[state=open]:border-border/60",
  GHOST_OPEN_CLASSNAME,
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

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
              "flex w-full items-center gap-2 rounded-none px-4 py-2 text-left text-callout",
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

function PickerEmptyState(props: { text: string }) {
  return (
    <Empty className="gap-0 rounded-none bg-transparent px-3 py-2.5">
      <EmptyHeader className="max-w-none items-start text-left">
        <EmptyDescription className="text-callout">{props.text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ScopeSectionHeader(props: { title: string; onCreate: () => void; createLabel: string }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1 pt-2">
      <span className="text-caption font-semibold text-label-secondary">{props.title}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-label-secondary"
        aria-label={props.createLabel}
        onClick={props.onCreate}
      >
        <Plus className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function ScopeSubpanelAction(props: {
  children: ReactNode;
  subpanel: ReactNode;
  className?: string;
}) {
  const openTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const collisionBoundary = useFloatingPanelBoundary();

  useEffect(() => {
    return () => {
      if (openTimeoutRef.current !== null) {
        window.clearTimeout(openTimeoutRef.current);
      }
      if (closeTimeoutRef.current === null) return;
      window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const clearOpenTimeout = () => {
    if (openTimeoutRef.current === null) return;
    window.clearTimeout(openTimeoutRef.current);
    openTimeoutRef.current = null;
  };

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current === null) return;
    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  };

  const openSubpanel = () => {
    clearOpenTimeout();
    clearCloseTimeout();
    setOpen(true);
  };

  const scheduleOpen = () => {
    clearOpenTimeout();
    clearCloseTimeout();
    openTimeoutRef.current = window.setTimeout(() => {
      setOpen(true);
      openTimeoutRef.current = null;
    }, SUBPANEL_OPEN_DELAY_MS);
  };

  const scheduleClose = () => {
    clearOpenTimeout();
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimeoutRef.current = null;
    }, SUBPANEL_CLOSE_DELAY_MS);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearCloseTimeout();
        setOpen(next);
      }}
    >
      <PopoverAnchor className="block w-full">
        <PanelMenuButton
          className={cn("rounded-none px-3 py-2.5", props.className)}
          onClick={openSubpanel}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          onFocus={scheduleOpen}
          onBlur={scheduleClose}
        >
          {props.children}
        </PanelMenuButton>
      </PopoverAnchor>
      {open ? (
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          collisionBoundary={collisionBoundary ?? undefined}
          collisionPadding={16}
          className="flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-md p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onMouseDownCapture={(event) => event.stopPropagation()}
          onPointerDownCapture={(event) => event.stopPropagation()}
          onMouseEnter={clearCloseTimeout}
          onMouseLeave={scheduleClose}
          onFocusCapture={clearCloseTimeout}
          onBlurCapture={scheduleClose}
        >
          {props.subpanel}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

function ProjectPickerItemContent(props: { project: ScopeProjectItem; selected: boolean }) {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ProjectAvatar
          name={props.project.name}
          size={22}
          className="shrink-0 rounded-sm"
          {...projectAvatarPropsFromIdentity(props.project)}
        />
        <div className="min-w-0 flex-1 text-left">
          <ClampedText
            text={props.project.name}
            className="truncate text-callout font-semibold text-label-primary"
          />
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

function TriggerIdentityAvatar(props: {
  identity: ScopeIdentity;
  size: number;
  className?: string;
}) {
  if (props.identity.kind === "project") {
    return (
      <ProjectAvatar
        name={props.identity.name}
        size={props.size}
        decorative
        className={cn("shrink-0", props.className)}
        {...projectAvatarPropsFromIdentity(props.identity.identity)}
      />
    );
  }
  return (
    <WorkspaceAvatar
      name={props.identity.name}
      size={props.size}
      decorative
      className={cn("shrink-0", props.className)}
      {...workspaceAvatarPropsFromIdentity(props.identity.identity)}
    />
  );
}

function PanelContentInner(props: {
  projects: readonly UserCenterProjectListItem[];
  selectedProjectId: string | null;
  selectedProject: ScopeProjectItem | null;
  projectsLoading: boolean;
  hasLoadError: boolean;
  onSelectProject: (project: ScopeProjectItem) => void;
  onOpenProjectCreateDialog: () => void;
  onOpenProjectSettings: () => void;
}) {
  const { t } = useTranslation("common");
  const { closeFloatingPanel } = useFloatingPanel();
  const [projectSearch, setProjectSearch] = useState("");

  const filteredProjects = useMemo(() => {
    const normalized = projectSearch.trim().toLocaleLowerCase();
    if (!normalized) return props.projects;
    return props.projects.filter((project) =>
      project.name.toLocaleLowerCase().includes(normalized),
    );
  }, [projectSearch, props.projects]);

  const canOpenProjectSettings = Boolean(props.selectedProject);

  if (props.hasLoadError) {
    return (
      <div className="w-full min-w-0">
        <PanelErrorMessage message={t("common:REQUEST_FAILED")} />
      </div>
    );
  }

  const renderRoot = () => (
    <div className="space-y-1 py-1.5">
      <ScopeSectionHeader
        title={t("common:WORKSPACE_SWITCHER_PROJECT_SECTION")}
        createLabel={t("common:WORKSPACE_SWITCHER_NEW_PROJECT")}
        onCreate={() => {
          closeFloatingPanel();
          props.onOpenProjectCreateDialog();
        }}
      />
      <ScopeSubpanelAction subpanel={renderProjectsPicker()}>
        <PanelMenuItemContent
          text={props.selectedProject?.name ?? t("common:WORKSPACE_SWITCHER_SELECT_PROJECT")}
          icon={
            props.selectedProject ? (
              <ProjectAvatar
                name={props.selectedProject.name}
                size={22}
                className="rounded-sm"
                {...projectAvatarPropsFromIdentity(props.selectedProject)}
              />
            ) : (
              <PanelsTopLeft className="size-4" aria-hidden="true" />
            )
          }
          right={<ChevronRight className="size-4" aria-hidden="true" />}
        />
      </ScopeSubpanelAction>
      <PanelMenuButton
        className="rounded-none px-3 py-2.5"
        disabled={!canOpenProjectSettings}
        onClick={() => {
          closeFloatingPanel();
          props.onOpenProjectSettings();
        }}
      >
        <PanelMenuItemContent
          icon={<Settings2 className="size-4" aria-hidden="true" />}
          text={t("common:WORKSPACE_SWITCHER_PROJECT_SETTINGS")}
        />
      </PanelMenuButton>
    </div>
  );

  const renderProjectsPicker = () => {
    if (props.projectsLoading) {
      return <PanelPickerSkeleton rows={4} />;
    }
    return (
      <div className="flex min-h-0 flex-col py-1.5">
        <label className="flex items-center gap-2 border-b border-border/45 px-3">
          <Search className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
          <Input
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            placeholder={t("common:WORKSPACE_SWITCHER_PROJECT_SEARCH_PLACEHOLDER")}
            className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </label>
        <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain scrollbar-none">
          {filteredProjects.length === 0 ? (
            <PickerEmptyState text={t("common:WORKSPACE_SWITCHER_PROJECT_EMPTY")} />
          ) : null}
          {filteredProjects.map((project) => {
            const selected = String(props.selectedProjectId || "") === String(project.projectId);
            return (
              <PanelMenuButton
                key={project.projectId}
                onClick={() => {
                  props.onSelectProject(project);
                  closeFloatingPanel();
                }}
                disabled={!project.enterable}
                className={cn("rounded-none px-3 py-2.5", selected && GHOST_SELECTED_CLASSNAME)}
              >
                <ProjectPickerItemContent project={project} selected={selected} />
              </PanelMenuButton>
            );
          })}
        </div>
        <PanelMenuButton
          className="rounded-none px-3 py-2.5"
          onClick={() => {
            closeFloatingPanel();
            props.onOpenProjectCreateDialog();
          }}
        >
          <PanelMenuItemContent
            icon={<Plus className="size-4" aria-hidden="true" />}
            text={t("common:WORKSPACE_SWITCHER_NEW_PROJECT")}
          />
        </PanelMenuButton>
      </div>
    );
  };

  return (
    <div className="w-full min-w-0">
      {props.projectsLoading ? <PanelPickerSkeleton rows={4} /> : renderRoot()}
    </div>
  );
}

function HeaderScopeTrigger(props: {
  triggerText: string;
  identity: ScopeIdentity;
  label: string;
  disabled: boolean;
}) {
  const { isOpen } = useFloatingPanel();
  return (
    <FloatingPanelTrigger
      title={props.triggerText}
      disableLayoutId
      className={cn(headerTriggerButtonClassName, props.disabled && "opacity-60")}
      disabled={props.disabled}
    >
      <TriggerIdentityAvatar identity={props.identity} size={28} />
      <div className="min-w-0 overflow-hidden text-left">
        <TruncatedText
          text={props.triggerText}
          className="text-callout font-semibold text-label-primary"
        />
      </div>
      <span className="sr-only">{props.label}</span>
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

function SidebarScopeTrigger(props: {
  triggerText: string;
  identity: ScopeIdentity;
  label: string;
  disabled: boolean;
}) {
  const { isOpen } = useFloatingPanel();
  return (
    <FloatingPanelTrigger
      title={props.triggerText}
      disableLayoutId
      className={cn(
        sidebarTriggerButtonClassName,
        "w-full max-w-full overflow-hidden",
        props.disabled && "opacity-60",
      )}
      disabled={props.disabled}
    >
      <TriggerIdentityAvatar identity={props.identity} size={32} className="self-center" />
      <div className={sidebarTriggerTextClassName}>
        <TruncatedText
          text={props.triggerText}
          className="text-callout font-semibold text-label-primary"
        />
      </div>
      <span className="sr-only">{props.label}</span>
      <span
        className={cn(
          "ml-auto flex size-4 shrink-0 items-center justify-center",
          "group-data-[collapsible=icon]:ml-0",
          NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
        )}
      >
        <ChevronDown
          className={cn(
            "size-4 opacity-70 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </span>
    </FloatingPanelTrigger>
  );
}

function SidebarScopeTriggerShell(props: {
  triggerText: string;
  identity: ScopeIdentity;
  label: string;
  disabled: boolean;
}) {
  const { isOpen } = useFloatingPanel();
  return (
    <div
      data-panel-open={isOpen ? "true" : "false"}
      className={cn(
        sidebarTriggerShellClassName,
        "[[data-collapsible=icon]:not([data-hover-preview=true])_&]:justify-start [[data-collapsible=icon]:not([data-hover-preview=true])_&]:gap-0",
      )}
    >
      <SidebarScopeTrigger
        triggerText={props.triggerText}
        identity={props.identity}
        label={props.label}
        disabled={props.disabled}
      />
    </div>
  );
}

type AdminScopeSwitcherProps = {
  className?: string;
  variant?: "sidebar" | "header";
};

export function AdminScopeSwitcher({
  className,
  variant = "sidebar",
}: AdminScopeSwitcherProps = {}) {
  const { t } = useTranslation(["common", "ai"]);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const currentProjectId = useWorkspaceStore((state) => state.currentProjectId);
  const setCurrentContext = useWorkspaceStore((state) => state.setCurrentContext);

  const { selectedWorkspaceId } = useWorkspaceScope();

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", selectedWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && selectedWorkspaceId),
    queryFn: async () => getWorkspaceDetail(String(selectedWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const routeProjectId = useMemo(() => extractRouteProjectId(pathname), [pathname]);

  const projectsQuery = useQuery({
    queryKey: ["scope-switcher", "projects", selectedWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && selectedWorkspaceId && routeProjectId),
    queryFn: async () => {
      const result = await listProjects({
        workspaceId: String(selectedWorkspaceId),
        archived: false,
        page: 1,
        size: 100,
      });
      return sortProjectPickerItems(result.items.map(mapProjectToListItem));
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const routeProjectDetailQuery = useQuery({
    queryKey: ["project", "detail", routeProjectId, sessionVersion],
    enabled: Boolean(accessToken && routeProjectId),
    queryFn: async () => getProjectDetail(String(routeProjectId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const selectedProjectId = routeProjectId ?? currentProjectId ?? null;
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return (
      (projectsQuery.data ?? []).find(
        (project) => String(project.projectId) === String(selectedProjectId),
      ) ?? null
    );
  }, [projectsQuery.data, selectedProjectId]);

  const workspaceName = workspaceDetailQuery.data?.name ?? "";
  const routeProjectIdentity = routeProjectDetailQuery.data?.project ?? null;
  const isConcreteProjectRoute = Boolean(routeProjectId);
  const concreteRouteProjectIdentity =
    routeProjectIdentity ??
    (isConcreteProjectRoute && selectedProject?.projectId === routeProjectId
      ? selectedProject
      : null);
  const scopeIdentity: ScopeIdentity =
    isConcreteProjectRoute && concreteRouteProjectIdentity
      ? {
          kind: "project",
          name: concreteRouteProjectIdentity.name,
          identity: concreteRouteProjectIdentity,
        }
      : {
          kind: "workspace",
          name: workspaceName || t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE"),
          identity: workspaceDetailQuery.data ?? null,
        };
  const triggerText = scopeIdentity.name || t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE");
  const panelSelectedProject: ScopeProjectItem | null =
    selectedProject ??
    (isConcreteProjectRoute && routeProjectIdentity
      ? mapProjectDetailToScopeItem(routeProjectIdentity)
      : null);

  const isHeaderVariant = variant === "header";
  if (!isConcreteProjectRoute) {
    return null;
  }

  const canOpenPanel = Boolean(accessToken);
  const label = t("common:WORKSPACE_SWITCHER_SELECT_SCOPE");

  return (
    <FloatingPanelRoot
      className={cn(
        isHeaderVariant ? "inline-flex min-w-0 max-w-full" : "w-full min-w-0",
        className,
      )}
    >
      {isHeaderVariant ? (
        <HeaderScopeTrigger
          triggerText={triggerText}
          identity={scopeIdentity}
          label={label}
          disabled={!canOpenPanel}
        />
      ) : (
        <div className="w-full px-2 pt-2">
          <SidebarScopeTriggerShell
            triggerText={triggerText}
            identity={scopeIdentity}
            label={label}
            disabled={!canOpenPanel}
          />
        </div>
      )}

      <FloatingPanelContent
        placement="bottom"
        offset={isHeaderVariant ? 10 : 8}
        showTitle={false}
        matchTriggerWidth
        className="max-w-[calc(100vw-1rem)] p-0"
      >
        <PanelContentInner
          projects={projectsQuery.data ?? []}
          selectedProjectId={panelSelectedProject?.projectId ?? null}
          selectedProject={panelSelectedProject}
          projectsLoading={projectsQuery.isLoading}
          hasLoadError={Boolean(projectsQuery.isError)}
          onSelectProject={(project) => {
            setCurrentContext({
              workspaceId: project.workspaceId,
              projectId: project.projectId,
            });
            void navigate({ to: projectHomePath(project.projectId) as never });
          }}
          onOpenProjectCreateDialog={() => {
            void navigate({
              to: "/" as never,
              search: { prompt: t("ai:AI_CHAT_CREATE_PROJECT_PROMPT") } as never,
            });
          }}
          onOpenProjectSettings={() => {
            if (!panelSelectedProject) return;
            void navigate({
              to: `/projects/${panelSelectedProject.projectId}/settings/general/` as never,
            });
          }}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
