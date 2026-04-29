import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import clsx from "clsx";

import { AdminRouteContainer } from "@/components/layout/admin-route-container";

import {
  ColumnsPageDesktopPane,
  ColumnsPageMobilePaneSheet,
  getColumnsPagePaneLabel,
  type ColumnsPagePaneToggle,
  type ColumnsPageSideSlots,
} from "./columns-page-layout";
import {
  getPageTitleTooltipLabel,
  PageMainRegion,
  shouldHidePageHeader,
  type BasePageProps,
} from "./page-main-region";

export type ColumnsPageProps = BasePageProps & {
  sideSlots: ColumnsPageSideSlots;
  overlay?: ReactNode;
  footer?: ReactNode;
};

const COLUMNS_PAGE_DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

function PageShellTopSpacer() {
  return (
    <div
      className="relative min-h-[20px] max-h-[88px] w-full overflow-hidden"
      aria-hidden="true"
      data-slot="page-shell-top-spacer"
    >
      <div className="relative w-full pb-0 xl:pb-[clamp(20px,calc(5.90277778vw_-_65px),88px)]" />
    </div>
  );
}

function getColumnsPageDesktopMatch() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(COLUMNS_PAGE_DESKTOP_MEDIA_QUERY).matches;
}

export function ColumnsPage({
  title,
  titleTooltip,
  description,
  showFavoriteToggle = true,
  favoritePath,
  afterFavorite,
  headerVisibility = "auto",
  action,
  extra,
  sideSlots,
  overlay,
  footer,
  children,
  className,
  contentClassName,
}: ColumnsPageProps) {
  const hideHeader = headerVisibility === "always" ? false : shouldHidePageHeader(children);
  const resolvedTitleTooltip = titleTooltip ?? getPageTitleTooltipLabel(title);
  const leftSideSlot = hideHeader ? undefined : sideSlots?.left;
  const rightSideSlot = hideHeader ? undefined : sideSlots?.right;
  const hasSideSlots = Boolean(leftSideSlot || rightSideSlot);
  const hasFooter = Boolean(footer);
  const fillAvailableHeight = Boolean(footer) || !hasSideSlots;
  const [isDesktop, setIsDesktop] = useState(getColumnsPageDesktopMatch);
  const [mobileOpenSide, setMobileOpenSide] = useState<"left" | "right" | null>(null);
  const paneToggles = useMemo<ColumnsPagePaneToggle[]>(() => {
    const out: ColumnsPagePaneToggle[] = [];
    if (leftSideSlot) out.push({ side: "left", slot: leftSideSlot });
    if (rightSideSlot) out.push({ side: "right", slot: rightSideSlot });
    return out;
  }, [leftSideSlot, rightSideSlot]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQueryList = window.matchMedia(COLUMNS_PAGE_DESKTOP_MEDIA_QUERY);
    const syncMatch = (event?: MediaQueryListEvent) => {
      const next = event?.matches ?? mediaQueryList.matches;
      setIsDesktop((prev) => (prev === next ? prev : next));
    };

    syncMatch();
    mediaQueryList.addEventListener("change", syncMatch);
    return () => mediaQueryList.removeEventListener("change", syncMatch);
  }, []);

  const mainRegion = (
    <PageMainRegion
      title={hideHeader ? undefined : title}
      titleTooltip={hideHeader ? undefined : resolvedTitleTooltip}
      description={hideHeader ? undefined : description}
      showFavoriteToggle={hideHeader ? false : showFavoriteToggle}
      favoritePath={hideHeader ? undefined : favoritePath}
      afterFavorite={hideHeader ? undefined : afterFavorite}
      action={hideHeader ? undefined : action}
      extra={hideHeader ? undefined : extra}
      contentClassName={contentClassName}
      fillAvailableHeight={fillAvailableHeight}
      paneToggles={paneToggles.map((toggle) => ({
        side: toggle.side,
        label: getColumnsPagePaneLabel(toggle.slot, toggle.side),
      }))}
      onOpenPane={setMobileOpenSide}
    >
      {children}
    </PageMainRegion>
  );

  return (
    <AdminRouteContainer
      className={clsx(
        "min-h-full min-w-0",
        fillAvailableHeight && "flex-1",
        hasFooter && "h-full overflow-hidden",
        className,
      )}
      innerClassName={clsx(hasFooter && "h-full min-h-0 overflow-hidden pb-0")}
      overlay={overlay}
    >
      <PageShellTopSpacer />
      <div
        className={clsx("flex min-h-0 min-w-0 w-full flex-col", fillAvailableHeight && "flex-1")}
        data-slot="columns-page-stack"
      >
        {isDesktop && (hasSideSlots || !hideHeader) ? (
          <>
            <div
              className={clsx(
                "hidden min-h-0 min-w-0 w-full lg:flex",
                fillAvailableHeight && "flex-1",
              )}
              data-slot="columns-page-shell"
            >
              <AnimatePresence initial={false}>
                {leftSideSlot ? <ColumnsPageDesktopPane side="left" slot={leftSideSlot} /> : null}
              </AnimatePresence>
              {mainRegion}
              <AnimatePresence initial={false}>
                {rightSideSlot ? (
                  <ColumnsPageDesktopPane side="right" slot={rightSideSlot} />
                ) : null}
              </AnimatePresence>
            </div>
            {paneToggles.map((toggle) => (
              <ColumnsPageMobilePaneSheet
                key={toggle.side}
                toggle={toggle}
                open={mobileOpenSide === toggle.side}
                onOpenChange={(open) => setMobileOpenSide(open ? toggle.side : null)}
              />
            ))}
          </>
        ) : hasSideSlots ? (
          <>
            <div className="flex min-h-0 min-w-0 w-full flex-1 lg:hidden">{mainRegion}</div>
            {paneToggles.map((toggle) => (
              <ColumnsPageMobilePaneSheet
                key={toggle.side}
                toggle={toggle}
                open={mobileOpenSide === toggle.side}
                onOpenChange={(open) => setMobileOpenSide(open ? toggle.side : null)}
              />
            ))}
          </>
        ) : (
          mainRegion
        )}
        {footer ? (
          <div className={clsx(hasFooter && "-mx-[var(--admin-route-gutter-x)]")}>{footer}</div>
        ) : null}
      </div>
    </AdminRouteContainer>
  );
}
