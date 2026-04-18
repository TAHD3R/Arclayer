import { Fragment, useLayoutEffect, type ReactNode } from "react";

import { Link, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

import { iconSlot } from "@/components/layout/admin-side-nav/nav-icon-slot";
import {
  DISABLED_ITEM_CLASSNAME,
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "@/components/layout/admin-side-nav/nav-node-styles";
import {
  isExactMatch,
  NAV_ITEM_BUTTON_PADDING_CLASSNAME,
  NAV_ITEM_HEIGHT_CLASSNAME,
  NAV_ITEM_RADIUS_CLASSNAME,
} from "@/components/layout/admin-side-nav/nav-utils";
import { SETTINGS_NAV_ITEMS } from "@/constants/menu/settings";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  buildUsercenterOverlayPath,
  resolveUsercenterOverlayTabFromPath,
  type UsercenterOverlayTab,
} from "@/lib/routing/usercenter-overlay";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import { getUsercenterOverlayItem } from "@/pages/usercenter/shared/usercenter-overlay-registry";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { AdminNavItem } from "@/types/admin-nav";

type SettingsFrameProps = {
  activePath: string;
  activeTab: UsercenterOverlayTab;
  children: ReactNode;
  onClose?: () => void;
  onSelectItem?: (item: AdminNavItem) => void;
  expandedGutters?: boolean;
  className?: string;
};

function resolveLeadingLabel(item: AdminNavItem, t: (key: string) => string): string | null {
  if (item.groupLabelBeforeKey) return t(item.groupLabelBeforeKey);
  return item.groupLabelBefore ?? null;
}

function SettingsNavList(props: {
  items: readonly AdminNavItem[];
  pathname: string;
  onSelectItem?: (item: AdminNavItem) => void;
}) {
  const { t } = useTranslation();
  let previousLabel: string | null = null;

  return (
    <nav aria-label={t("account:SETTINGS_SHELL_TITLE")} className="py-4">
      <ul className="space-y-1.5">
        {props.items.map((item) => {
          const isActive = Boolean(item.to && isExactMatch(item.to, props.pathname));
          const label = item.labelKey ? t(item.labelKey) : item.label;
          const leadingLabel = resolveLeadingLabel(item, t);
          const showLeadingLabel = Boolean(leadingLabel && leadingLabel !== previousLabel);
          previousLabel = leadingLabel ?? previousLabel;

          return (
            <Fragment key={item.key}>
              {showLeadingLabel ? (
                <li
                  data-slot="settings-nav-group-label"
                  className="px-3 pt-4 pb-2 text-xs font-semibold text-label-tertiary"
                  aria-hidden="true"
                >
                  {leadingLabel}
                </li>
              ) : null}
              <li>
                <div className="group/nav-item">
                  {item.to && !item.disabled ? (
                    props.onSelectItem ? (
                      <button
                        type="button"
                        data-active={isActive}
                        className={cn(
                          "relative z-10 flex w-full items-center gap-1 text-sm",
                          NAV_ITEM_HEIGHT_CLASSNAME,
                          NAV_ITEM_RADIUS_CLASSNAME,
                          NAV_ITEM_BUTTON_PADDING_CLASSNAME,
                          INTERACTIVE_TRANSITION_CLASSNAME,
                          NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
                          NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
                          isActive && "font-semibold",
                        )}
                        onClick={() => props.onSelectItem?.(item)}
                      >
                        {iconSlot(0, item.icon, { isActive })}
                        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                      </button>
                    ) : (
                      <Link
                        to={item.to}
                        className={cn(
                          "relative z-10 flex items-center gap-1 text-sm",
                          NAV_ITEM_HEIGHT_CLASSNAME,
                          NAV_ITEM_RADIUS_CLASSNAME,
                          NAV_ITEM_BUTTON_PADDING_CLASSNAME,
                          INTERACTIVE_TRANSITION_CLASSNAME,
                          NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
                          NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
                          isActive && "font-semibold",
                        )}
                        activeProps={{ "data-active": true }}
                        inactiveProps={{ "data-active": false }}
                      >
                        {iconSlot(0, item.icon, { isActive })}
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                      </Link>
                    )
                  ) : (
                    <div
                      aria-disabled="true"
                      data-active={isActive}
                      className={cn(
                        "relative z-10 flex items-center gap-1 text-sm",
                        NAV_ITEM_HEIGHT_CLASSNAME,
                        NAV_ITEM_RADIUS_CLASSNAME,
                        NAV_ITEM_BUTTON_PADDING_CLASSNAME,
                        INTERACTIVE_TRANSITION_CLASSNAME,
                        NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
                        NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
                        DISABLED_ITEM_CLASSNAME,
                      )}
                    >
                      {iconSlot(0, item.icon, { isActive })}
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </div>
                  )}
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsFrame(props: SettingsFrameProps) {
  const { t } = useTranslation("account");
  const activeItem = getUsercenterOverlayItem(props.activeTab);

  return (
    <div
      data-testid="settings-shell-frame"
      className={cn(
        "relative flex h-[calc(100dvh-100px)] w-[90vw] max-w-378 overflow-hidden rounded-[12px] border border-border/80 bg-background shadow-2xl",
        props.className,
      )}
    >
      <aside className="hidden h-full w-60 shrink-0 border-r border-border/70 bg-muted/30 lg:flex">
        <div className="flex min-h-0 w-full flex-col px-3">
          <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
            <SettingsNavList
              items={SETTINGS_NAV_ITEMS}
              pathname={props.activePath}
              onSelectItem={props.onSelectItem}
            />
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        {props.onClose ? (
          <div className="pointer-events-none absolute right-4 top-4 z-20">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="pointer-events-auto shrink-0 bg-background/80 backdrop-blur-xs"
              aria-label="Close"
              onClick={props.onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}

        <div
          data-testid="settings-shell-scroll-region"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          <DefaultPage
            title={t(activeItem.titleKey)}
            description={t(activeItem.descriptionKey)}
            showFavoriteToggle={false}
            pageFrame="full"
            largeViewportGutters={props.expandedGutters}
            className="min-h-full"
            contentClassName="min-h-full"
            contentContainerClassName="min-h-full"
          >
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col">
              {props.children}
            </div>
          </DefaultPage>
        </div>
      </div>
    </div>
  );
}

function resolveSettingsOverlayBackgroundPath() {
  const projectId =
    useWorkspaceStore.getState().currentProjectId ?? useWorkspaceStore.getState().lastProjectId;
  return projectId ? `${projectHomePath(projectId)}/` : "/";
}

export function SettingsRouteBridge() {
  const navigate = useNavigate();
  const { personalSettings } = useSearch({ from: "__root__" });
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      hash: state.location.hash,
    }),
    structuralSharing: true,
  });
  const activeTab = resolveSettingsFrameTab(location.pathname);

  useLayoutEffect(() => {
    if (personalSettings === activeTab) return;
    void navigate({
      to: resolveSettingsOverlayBackgroundPath() as never,
      hash: location.hash,
      replace: true,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        personalSettings: activeTab,
      })) as never,
      mask: {
        to: buildUsercenterOverlayPath(activeTab),
        hash: location.hash,
      },
    });
  }, [activeTab, location.hash, navigate, personalSettings]);

  return null;
}

export function resolveSettingsFrameTab(pathname: string): UsercenterOverlayTab {
  return resolveUsercenterOverlayTabFromPath(pathname) ?? "profile";
}
