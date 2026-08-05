import { Fragment, type ReactNode } from "react";

import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";

import { iconSlot } from "@/components/layout/admin-side-nav/nav-icon-slot";
import {
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
import { DefaultPage } from "@/layouts/page-shell/default-page";
import type { AdminNavItem } from "@/types/admin-nav";

type ContextSettingsShellProps = {
  title: string;
  pathname: string;
  items: readonly AdminNavItem[];
  action?: ReactNode;
  children: ReactNode;
};

function resolveLeadingLabel(item: AdminNavItem, t: (key: string) => string): string | null {
  if (item.groupLabelBeforeKey) return t(item.groupLabelBeforeKey);
  return item.groupLabelBefore ?? null;
}

function ContextSettingsNav(props: { items: readonly AdminNavItem[]; pathname: string }) {
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
                  className="pl-2 pr-3 pt-4 pb-2 text-footnote font-semibold text-label-secondary"
                  aria-hidden="true"
                >
                  {leadingLabel}
                </li>
              ) : null}
              <li>
                <Link
                  to={item.to ?? "/"}
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
              </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}

export function ContextSettingsShell(props: ContextSettingsShellProps) {
  return (
    <DefaultPage
      title={props.title}
      showFavoriteToggle={false}
      pageFrame="full"
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
      action={props.action}
    >
      <div className="mx-auto flex min-h-full w-full max-w-6xl gap-8">
        <aside className="hidden min-h-full w-60 shrink-0 lg:block">
          <div className="sticky top-0 min-h-0 w-full rounded-[12px] border border-border/70 bg-muted/20 px-3">
            <ContextSettingsNav items={props.items} pathname={props.pathname} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{props.children}</div>
      </div>
    </DefaultPage>
  );
}
