import { ArrowLeft, MessageSquareText } from "lucide-react";
import { Fragment, forwardRef } from "react";
import { useTranslation } from "react-i18next";

import { AskAiButton } from "@/components/ai/ask-ai-button";
import type { ProjectAvatarIdentity } from "@/components/common/project-avatar";
import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { WorkspaceCreditsControl } from "@/components/commerce/workspace-credits-control";
import { headerTriggerButtonClassName } from "@/components/layout/admin-scope-switcher";
import {
  ProjectBrowseMenuContent,
  type SidebarBrowseProject,
} from "@/components/layout/project-browse-menu";
import type {
  AdminTopbarBreadcrumbItem,
  AdminTopbarBreadcrumbMenuItem,
} from "@/lib/admin-topbar-breadcrumbs";
import { cn } from "@arclayer/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@arclayer/ui/breadcrumb";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { Button, type ButtonProps } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
const TOPBAR_CONTENT_PADDING_CLASSNAME = "px-4 py-2 sm:px-6 sm:py-3";
const MOBILE_TOPBAR_TOUCH_TARGET_CLASSNAME = "min-h-12 min-w-12 sm:min-h-0 sm:min-w-0";

type AdminTopbarLeadingMode = "none" | "logo" | "back";
export type AdminTopbarProject = ProjectAvatarIdentity & {
  projectId: string;
  name: string;
};

type AdminTopbarProjectMenu = {
  projects: readonly SidebarBrowseProject[];
  activeProjectId?: string | null;
  onProjectSelect: (projectId: string) => void;
  onAllProjectsSelect: () => void;
  onHomeSelect: () => void;
};

const topbarBreadcrumbButtonClassName = cn(
  "max-w-[min(22rem,34vw)] text-label-primary",
  "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground dark:data-[state=open]:bg-accent/50",
  "active:border-border/60 active:bg-accent/70 active:text-label-primary",
);

function TopbarLeading(props: {
  leadingMode: AdminTopbarLeadingMode;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div className="min-w-0 flex items-center gap-2">
      {props.leadingMode === "back" ? (
        <ButtonPrimitive
          type="button"
          tapScale={1}
          aria-label={props.backLabel}
          onClick={props.onBack}
          className={cn(
            headerTriggerButtonClassName,
            MOBILE_TOPBAR_TOUCH_TARGET_CLASSNAME,
            "text-callout font-semibold text-label-primary",
            "active:border-border/60 active:bg-accent/70 active:text-label-primary",
          )}
        >
          <ArrowLeft className="size-4 shrink-0 opacity-80" aria-hidden="true" />
          <span className="truncate">{props.backLabel}</span>
        </ButtonPrimitive>
      ) : null}
    </div>
  );
}

function resolveLabel(
  t: (key: string) => string,
  item: { label: string; labelKey?: string },
): string {
  return item.labelKey ? t(item.labelKey) : item.label;
}

type TopbarBreadcrumbButtonProps = Omit<
  ButtonProps,
  "asChild" | "children" | "variant" | "size"
> & {
  label: string;
};

const TopbarBreadcrumbButton = forwardRef<HTMLButtonElement, TopbarBreadcrumbButtonProps>(
  function TopbarBreadcrumbButton({ label, className, type = "button", ...buttonProps }, ref) {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="sm"
        type={type}
        tapScale={1}
        aria-label={label}
        className={cn(
          topbarBreadcrumbButtonClassName,
          MOBILE_TOPBAR_TOUCH_TARGET_CLASSNAME,
          className,
        )}
        {...buttonProps}
      >
        <span className="min-w-0 truncate">{label}</span>
      </Button>
    );
  },
);

function TopbarProjectBreadcrumb(props: {
  project: AdminTopbarProject;
  menu: AdminTopbarProjectMenu | null;
  labels: {
    descriptionFallback: string;
    allProjects: string;
    home: string;
  };
}) {
  const button = <TopbarBreadcrumbButton label={props.project.name} />;

  if (!props.menu) return button;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-[calc(100vw-2rem)] max-w-72">
        <ProjectBrowseMenuContent
          projects={props.menu.projects}
          activeProjectId={props.menu.activeProjectId}
          descriptionFallback={props.labels.descriptionFallback}
          allProjectsLabel={props.labels.allProjects}
          homeLabel={props.labels.home}
          onProjectSelect={props.menu.onProjectSelect}
          onAllProjectsSelect={props.menu.onAllProjectsSelect}
          onHomeSelect={props.menu.onHomeSelect}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopbarNavMenuContent(props: {
  items: readonly AdminTopbarBreadcrumbMenuItem[];
  t: (key: string) => string;
  onNavigate?: (to: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {props.items.map((item) => {
        const Icon = item.icon;
        const label = resolveLabel(props.t, item);
        return (
          <DropdownMenuIconItem
            key={item.key}
            disabled={item.disabled || !item.to}
            aria-current={item.isCurrent ? "page" : undefined}
            className={cn(
              "rounded-md",
              item.isCurrent && "bg-accent",
              item.to && !item.disabled && "hover:cursor-pointer",
            )}
            icon={Icon ? <Icon className="size-4" aria-hidden="true" /> : undefined}
            onSelect={() => {
              if (!item.to || item.disabled) return;
              props.onNavigate?.(item.to);
            }}
          >
            {label}
          </DropdownMenuIconItem>
        );
      })}
    </div>
  );
}

function TopbarNavBreadcrumbItem(props: {
  item: AdminTopbarBreadcrumbItem;
  t: (key: string) => string;
  onNavigate?: (to: string) => void;
}) {
  const label = resolveLabel(props.t, props.item);
  const button = (
    <TopbarBreadcrumbButton
      label={label}
      onClick={
        props.item.menuItems?.length
          ? undefined
          : () => {
              if (!props.item.to || props.item.disabled) return;
              props.onNavigate?.(props.item.to);
            }
      }
    />
  );

  if (!props.item.menuItems?.length) return button;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="min-w-56">
        <TopbarNavMenuContent
          items={props.item.menuItems}
          t={props.t}
          onNavigate={props.onNavigate}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopbarDefaultLeading(props: {
  project?: AdminTopbarProject | null;
  projectMenu?: AdminTopbarProjectMenu | null;
  breadcrumbs: readonly AdminTopbarBreadcrumbItem[];
  onNavigate?: (to: string) => void;
}) {
  const { t } = useTranslation(["common", "nav"]);
  const fallbackBreadcrumb: AdminTopbarBreadcrumbItem = {
    key: "home",
    label: "Home",
    labelKey: "nav:NAV_HOME",
    to: "/",
  };
  const navBreadcrumbs = props.breadcrumbs.length > 0 ? props.breadcrumbs : [fallbackBreadcrumb];

  return (
    <Breadcrumb aria-label={t("common:BREADCRUMB_LABEL")} className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {props.project ? (
          <>
            <BreadcrumbItem className="min-w-0">
              <TopbarProjectBreadcrumb
                project={props.project}
                menu={props.projectMenu ?? null}
                labels={{
                  descriptionFallback: t("common:SIDEBAR_BROWSE_PROJECT_DESCRIPTION_FALLBACK"),
                  allProjects: t("nav:NAV_ALL_PROJECTS"),
                  home: t("nav:NAV_HOME"),
                }}
              />
            </BreadcrumbItem>
            {navBreadcrumbs.length > 0 ? <BreadcrumbSeparator className="shrink-0" /> : null}
          </>
        ) : null}
        {navBreadcrumbs.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 ? <BreadcrumbSeparator className="shrink-0" /> : null}
            <BreadcrumbItem className="min-w-0">
              <TopbarNavBreadcrumbItem item={item} t={t} onNavigate={props.onNavigate} />
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function TopbarTrailing() {
  const { t } = useTranslation(["common"]);

  return (
    <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto">
      <FeedbackDialog
        source="header"
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            tapScale={1}
            aria-label={t("common:TOPBAR_FEEDBACK")}
            className={cn(MOBILE_TOPBAR_TOUCH_TARGET_CLASSNAME, "text-callout font-semibold")}
          >
            <MessageSquareText aria-hidden="true" />
            <span className="hidden sm:inline">{t("common:TOPBAR_FEEDBACK")}</span>
          </Button>
        }
      />
      <AskAiButton
        labelKey="common:TOPBAR_ASK_AI"
        className={MOBILE_TOPBAR_TOUCH_TARGET_CLASSNAME}
      />
      <WorkspaceCreditsControl className={MOBILE_TOPBAR_TOUCH_TARGET_CLASSNAME} />
      <AdminAccountMenu variant="header" />
    </div>
  );
}

export function AdminTopbar(props: {
  leadingMode?: AdminTopbarLeadingMode;
  backLabel?: string;
  onBack?: () => void;
  project?: AdminTopbarProject | null;
  projectMenu?: AdminTopbarProjectMenu | null;
  breadcrumbs?: readonly AdminTopbarBreadcrumbItem[];
  onNavigate?: (to: string) => void;
  className?: string;
}) {
  const leadingMode = props.leadingMode ?? "none";

  return (
    <header className={cn("relative z-30 inset-y-auto", "bg-header", props.className)}>
      <div
        className={cn(
          "flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4",
          "justify-between",
          TOPBAR_CONTENT_PADDING_CLASSNAME,
        )}
      >
        {leadingMode === "back" ? (
          <TopbarLeading
            leadingMode={leadingMode}
            backLabel={props.backLabel}
            onBack={props.onBack}
          />
        ) : (
          <TopbarDefaultLeading
            project={props.project ?? null}
            projectMenu={props.projectMenu ?? null}
            breadcrumbs={props.breadcrumbs ?? []}
            onNavigate={props.onNavigate}
          />
        )}
        <TopbarTrailing />
      </div>
    </header>
  );
}
