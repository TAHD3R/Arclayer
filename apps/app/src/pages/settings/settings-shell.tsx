import { Fragment, type ReactNode, useState } from "react";

import { ChevronRight, PanelLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Badge } from "@arclayer/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@arclayer/ui/sheet";
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
  items?: readonly SettingsNavItem[];
  identityOverrides?: SettingsNavIdentityOverrides;
  className?: string;
};

export type SettingsNavIdentityOverrides = Partial<
  Record<"personal.profile" | "workspace.general", { label: string; icon: ReactNode }>
>;

function resolveLeadingLabel(item: SettingsNavItem, t: (key: string) => string): string | null {
  if (item.groupLabelBeforeKey) return t(item.groupLabelBeforeKey);
  return item.groupLabelBefore ?? null;
}

function SettingsNavList(props: {
  items: readonly SettingsNavItem[];
  activeScreen: SettingsScreen;
  onSelectItem: (item: SettingsNavItem) => void;
  identityOverrides?: SettingsNavIdentityOverrides;
}) {
  const { t } = useTranslation();
  let previousLabel: string | null = null;

  return (
    <nav aria-label={t("account:SETTINGS_SHELL_TITLE")} className="py-4">
      <ul className="space-y-1.5">
        {props.items.map((item) => {
          const isActive = item.screen === props.activeScreen;
          const identityOverride =
            props.identityOverrides?.[item.screen as keyof SettingsNavIdentityOverrides];
          const label = identityOverride?.label ?? (item.labelKey ? t(item.labelKey) : item.label);
          const leadingLabel = resolveLeadingLabel(item, t);
          const showLeadingLabel = Boolean(leadingLabel && leadingLabel !== previousLabel);
          const isFirstGroup = showLeadingLabel && previousLabel === null;
          previousLabel = leadingLabel ?? previousLabel;

          return (
            <Fragment key={item.key}>
              {showLeadingLabel ? (
                <li
                  data-slot="settings-nav-group-label"
                  className={cn(
                    "pl-2 pr-3 pb-2 text-footnote font-semibold text-label-secondary",
                    isFirstGroup ? "pt-0" : "pt-4",
                  )}
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
                      data-unavailable={item.unavailable || undefined}
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
                      {iconSlot(0, item.icon, {
                        isActive,
                        iconNode: identityOverride?.icon,
                      })}
                      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                      {item.badgeLabelKey ? (
                        <Badge variant="secondary" className="max-w-24 truncate px-1.5">
                          {t(item.badgeLabelKey)}
                        </Badge>
                      ) : null}
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
                      {iconSlot(0, item.icon, {
                        isActive,
                        iconNode: identityOverride?.icon,
                      })}
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

function SettingsMobileNav(props: {
  items: readonly SettingsNavItem[];
  activeScreen: SettingsScreen;
  onSelectItem: (item: SettingsNavItem) => void;
  identityOverrides?: SettingsNavIdentityOverrides;
}) {
  const { t } = useTranslation("account");
  const [open, setOpen] = useState(false);
  const activeItem = props.items.find((item) => item.screen === props.activeScreen);
  const activeIdentity = activeItem
    ? props.identityOverrides?.[activeItem.screen as keyof SettingsNavIdentityOverrides]
    : undefined;
  const activeLabel =
    activeIdentity?.label ??
    (activeItem
      ? activeItem.labelKey
        ? t(activeItem.labelKey)
        : activeItem.label
      : t("SETTINGS_SHELL_TITLE"));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-auto w-full !justify-between gap-3 px-3 py-2.5 text-left"
          aria-label={t("SETTINGS_SHELL_NAVIGATION_ACTION")}
        >
          <span className="flex min-w-0 items-center gap-3">
            <PanelLeft aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-headline font-medium text-label-primary">
                {activeLabel}
              </span>
              <span className="block text-footnote font-normal text-label-secondary">
                {t("SETTINGS_SHELL_NAVIGATION_HINT")}
              </span>
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-label-tertiary" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(22rem,calc(100vw-1rem))] gap-0"
        closeButtonLabel={t("common:CLOSE")}
      >
        <SheetHeader>
          <SheetTitle>{t("SETTINGS_SHELL_TITLE")}</SheetTitle>
          <SheetDescription>{t("SETTINGS_SHELL_NAVIGATION_DESC")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <SettingsNavList
            items={props.items}
            activeScreen={props.activeScreen}
            identityOverrides={props.identityOverrides}
            onSelectItem={(item) => {
              setOpen(false);
              props.onSelectItem(item);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SettingsFrame(props: SettingsFrameProps) {
  const { t } = useTranslation("account");
  const activeItem = getUsercenterOverlayItem(props.activeScreen);
  const navItems = props.items ?? SETTINGS_NAV_ITEMS;

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
              items={navItems}
              activeScreen={props.activeScreen}
              identityOverrides={props.identityOverrides}
              onSelectItem={(item) => props.onSelectItem?.(item)}
            />
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <div className="shrink-0 border-b border-border/70 bg-background px-4 py-3 lg:hidden">
          <SettingsMobileNav
            items={navItems}
            activeScreen={props.activeScreen}
            identityOverrides={props.identityOverrides}
            onSelectItem={(item) => props.onSelectItem?.(item)}
          />
        </div>

        {props.onClose ? (
          <div className="pointer-events-none absolute right-4 top-4 z-30">
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
            headerBehavior="sticky"
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
