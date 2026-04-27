import { Fragment, type ReactNode } from "react";

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
  NAV_ITEM_BUTTON_PADDING_CLASSNAME,
  NAV_ITEM_HEIGHT_CLASSNAME,
  NAV_ITEM_RADIUS_CLASSNAME,
} from "@/components/layout/admin-side-nav/nav-utils";
import { SETTINGS_NAV_ITEMS, type SettingsNavItem } from "@/constants/menu/settings";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import type { SettingsScreen } from "@/lib/settings/settings-screen";
import { getUsercenterOverlayItem } from "@/pages/usercenter/shared/usercenter-overlay-registry";

type SettingsFrameProps = {
  activeScreen: SettingsScreen;
  action?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  onSelectItem?: (item: SettingsNavItem) => void;
  className?: string;
};

function resolveLeadingLabel(item: SettingsNavItem, t: (key: string) => string): string | null {
  if (item.groupLabelBeforeKey) return t(item.groupLabelBeforeKey);
  return item.groupLabelBefore ?? null;
}

function SettingsNavList(props: {
  items: readonly SettingsNavItem[];
  activeScreen: SettingsScreen;
  onSelectItem: (item: SettingsNavItem) => void;
}) {
  const { t } = useTranslation();
  let previousLabel: string | null = null;

  return (
    <nav aria-label={t("account:SETTINGS_SHELL_TITLE")} className="py-4">
      <ul className="space-y-1.5">
        {props.items.map((item) => {
          const isActive = item.screen === props.activeScreen;
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
                  {!item.disabled ? (
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
                      onClick={() => props.onSelectItem(item)}
                    >
                      {iconSlot(0, item.icon, { isActive })}
                      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                    </button>
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
  const activeItem = getUsercenterOverlayItem(props.activeScreen);

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
              activeScreen={props.activeScreen}
              onSelectItem={(item) => props.onSelectItem?.(item)}
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
            action={props.action}
            pageFrame="full"
            spacingPreset="settings-dialog"
            className="min-h-full"
            contentClassName="min-h-full"
            contentContainerClassName="min-h-full"
          >
            <div className="mx-auto flex min-h-full w-full flex-col">{props.children}</div>
          </DefaultPage>
        </div>
      </div>
    </div>
  );
}
