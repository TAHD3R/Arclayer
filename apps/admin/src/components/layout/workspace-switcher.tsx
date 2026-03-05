import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { Avatar } from "antd";
import { ChevronDown, PanelLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getWorkspaceDetail } from "@/api/workspaces";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import { cn } from "@celestial/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceSwitchDialogStore } from "@/stores/use-workspace-switch-dialog-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useSidebar } from "@celestial/ui/sidebar";

function firstLetter(input: string): string {
  const text = String(input || "").trim();
  if (!text) return "?";
  return text.slice(0, 1).toUpperCase();
}

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
  "border-0",
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

export function AdminWorkspaceSwitcher() {
  const { t } = useTranslation(["common"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const dialogOpen = useWorkspaceSwitchDialogStore((s) => s.open);
  const dialogOrgId = useWorkspaceSwitchDialogStore((s) => s.organizationId);
  const openDialog = useWorkspaceSwitchDialogStore((s) => s.openDialog);
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

  const triggerState = useMemo(() => {
    if (!organizationId) return "closed";
    if (!dialogOpen) return "closed";
    return dialogOrgId === organizationId ? "open" : "closed";
  }, [dialogOpen, dialogOrgId, organizationId]);

  const canOpenDialog = Boolean(organizationId);
  const label = t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE");

  return (
    <div className="w-full min-w-0">
      <div
        className={cn(
          sidebarTriggerShellClassName,
          "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
        )}
      >
        <button
          type="button"
          title={label}
          aria-label={label}
          data-state={triggerState}
          className={cn(sidebarTriggerButtonClassName, !canOpenDialog && "opacity-60")}
          onClick={() => {
            if (!organizationId) return;
            openDialog({ organizationId });
          }}
        >
          <Avatar size={32} className="shrink-0 rounded-md">
            {firstLetter(workspaceName || label)}
          </Avatar>

          <div
            className={cn(
              "min-w-0 flex-1",
              NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
              "group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none",
            )}
          >
            <div className="truncate text-callout font-semibold text-foreground">
              {workspaceName || label}
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
  );
}
