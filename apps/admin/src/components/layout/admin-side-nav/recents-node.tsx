import { useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";
import { SidebarMenuButton, SidebarMenuItem } from "@arclayer/ui/sidebar";
import { ArrowUpRight, History, Search } from "lucide-react";

import { UserAvatar } from "@/components/common/entity-avatar";
import { openAdminCommand } from "@/lib/command/command-bridge";
import { resolveRecentCommandEntries } from "@/lib/command/entry-utils";
import { buildAdminNavCommandEntries } from "@/lib/command/nav-command-items";
import type { CommandEntry } from "@/lib/command/command-types";
import {
  buildUsercenterOverlayNavigate,
  resolveUsercenterOverlayTabFromPath,
} from "@/lib/routing/usercenter-overlay";
import { useCommandRecentStore } from "@/stores/use-command-recent-store";
import type { AdminNavItem } from "@/types/admin-nav";
import {
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import {
  NAV_ITEM_BUTTON_PADDING_CLASSNAME,
  NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
  NAV_ITEM_HEIGHT_CLASSNAME,
  NAV_ITEM_RADIUS_CLASSNAME,
} from "./nav-utils";
import { iconSlot } from "./nav-icon-slot";

type RecentsNodeProps = {
  item: AdminNavItem;
  label: string;
  navItems: readonly AdminNavItem[];
  isCollapsed: boolean;
};

function RecentEntryRow(props: { entry: CommandEntry; onSelect: () => void }) {
  const Icon = props.entry.icon;

  return (
    <ButtonPrimitive
      type="button"
      tapScale={1}
      onClick={props.onSelect}
      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/55"
    >
      {props.entry.avatar ? (
        <UserAvatar
          name={props.entry.avatar.name}
          assetRef={props.entry.avatar.assetRef}
          size={32}
          className="mt-0.5 shrink-0"
        />
      ) : Icon ? (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-card/70 text-label-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-card/70 text-label-primary">
          <History className="size-4" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-callout font-medium text-label-primary">
          {props.entry.title}
        </span>
        <span className="mt-0.5 block truncate text-caption text-label-secondary">
          {props.entry.subtitle}
        </span>
      </span>
    </ButtonPrimitive>
  );
}

export function RecentsNode(props: RecentsNodeProps) {
  const { t, i18n } = useTranslation(["command", "nav"]);
  const navigate = useNavigate();
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      hash: state.location.hash,
    }),
    structuralSharing: true,
  });
  const recentRecords = useCommandRecentStore((state) => state.records);
  const recordRecent = useCommandRecentStore((state) => state.record);
  const [open, setOpen] = useState(false);

  const pageEntries = useMemo(
    () => buildAdminNavCommandEntries(props.navItems, t),
    [i18n.language, i18n.resolvedLanguage, props.navItems, t],
  );
  const recentEntries = useMemo(
    () => resolveRecentCommandEntries(recentRecords, pageEntries).slice(0, 3),
    [pageEntries, recentRecords],
  );

  const selectEntry = (entry: CommandEntry) => {
    if (entry.recent?.enabled) recordRecent(entry.recent.snapshot);
    if (entry.action.type === "callback") {
      entry.action.run();
      setOpen(false);
      return;
    }
    const usercenterTab = resolveUsercenterOverlayTabFromPath(entry.action.to);
    setOpen(false);
    if (usercenterTab) {
      void navigate(
        buildUsercenterOverlayNavigate({
          currentLocation: location,
          tab: usercenterTab,
        }),
      );
      return;
    }
    void navigate(
      entry.action.search
        ? { to: entry.action.to as never, search: entry.action.search as never }
        : { to: entry.action.to as never },
    );
  };

  return (
    <SidebarMenuItem className="group/nav-item">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor className="block w-full">
          <SidebarMenuButton
            isActive={open}
            tooltip={props.label}
            className={cn(
              "relative z-10",
              NAV_ITEM_HEIGHT_CLASSNAME,
              NAV_ITEM_RADIUS_CLASSNAME,
              INTERACTIVE_TRANSITION_CLASSNAME,
              NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
              NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
              NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
              NAV_ITEM_BUTTON_PADDING_CLASSNAME,
              "group-data-[collapsible=icon]:gap-0 hover:cursor-pointer",
            )}
            onClick={() => setOpen((prev) => !prev)}
          >
            {iconSlot(0, props.item.icon, { isActive: open, collapseMotion: "shift" })}
            <span className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
              {props.label}
            </span>
          </SidebarMenuButton>
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-64 p-1"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onMouseDownCapture={(event) => event.stopPropagation()}
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <div className="rounded-xl bg-popover">
            <div className="px-3 pb-2 pt-2.5 text-body font-semibold text-label-primary">
              {t("nav:NAV_RECENTS")}
            </div>
            <div className="flex flex-col gap-1 px-1 pb-2">
              {recentEntries.length > 0 ? (
                recentEntries.map((entry) => (
                  <RecentEntryRow
                    key={entry.id}
                    entry={entry}
                    onSelect={() => selectEntry(entry)}
                  />
                ))
              ) : (
                <div className="px-3 py-3 text-callout text-label-secondary">
                  {t("command:COMMAND_EMPTY_BROWSE")}
                </div>
              )}
            </div>
            <div className="border-t border-border/70 px-3 py-3 text-center">
              <p className="text-callout text-label-secondary">
                {t("nav:NAV_RECENTS_QUICK_SEARCH_PROMPT")}
              </p>
              <ButtonPrimitive
                type="button"
                tapScale={1}
                className="mt-2 inline-flex items-center gap-1 text-callout font-medium text-primary transition-colors hover:text-primary/80"
                onClick={() => {
                  setOpen(false);
                  openAdminCommand();
                }}
              >
                <Search className="size-4" aria-hidden="true" />
                <span>{t("nav:NAV_RECENTS_QUICK_SEARCH_ACTION")}</span>
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </ButtonPrimitive>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
}
