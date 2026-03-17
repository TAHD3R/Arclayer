import { Children, Fragment, isValidElement, type ReactNode, useMemo, useState } from "react";
import clsx from "clsx";
import { Star } from "@arclayer/ui/icons/lucide-animated";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@arclayer/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

import { ContentGuard, type ContentGuardProps } from "@/components/common/content-guard";
import { AdminRouteContainer } from "@/components/layout/admin-route-container";
import { ApiError } from "@/lib/http";
import { useFavoritesStore } from "@/stores/use-favorites-store";

import {
  DefaultPageDesktopPane,
  DefaultPageMainRegion,
  DefaultPageMobilePaneSheet,
  type PaneToggle,
  type DefaultPageSideSlots,
} from "./default-page-layout";

export type DefaultPageProps = {
  title?: ReactNode;
  description?: ReactNode;
  showFavoriteToggle?: boolean;
  action?: ReactNode;
  extra?: ReactNode;
  sideSlots?: DefaultPageSideSlots;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
};

function FavoriteToggle() {
  const { t } = useTranslation(["common"]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const paths = useFavoritesStore((s) => s.paths);
  const toggle = useFavoritesStore((s) => s.toggle);
  const isFavorited = paths.includes(pathname);
  const [hovered, setHovered] = useState(false);

  return (
    <Tooltip side="bottom">
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => toggle(pathname)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={clsx(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 leading-none transition-colors",
            "text-label-secondary hover:text-foreground",
            isFavorited && "text-primary hover:text-primary",
          )}
        >
          <Star
            size={16}
            strokeWidth={2}
            className={clsx(
              "transition-colors",
              hovered || isFavorited ? "fill-current" : "fill-transparent",
            )}
          />
          <span>{isFavorited ? t("common:FAVORITE_REMOVE") : t("common:FAVORITE_ADD")}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isFavorited ? t("common:FAVORITE_REMOVE_TOOLTIP") : t("common:FAVORITE_ADD_TOOLTIP")}
      </TooltipContent>
    </Tooltip>
  );
}

function resolveContentGuardError(node: ReactNode): unknown | null {
  let current: ReactNode = node;
  for (let depth = 0; depth < 3; depth += 1) {
    const asArray = Children.toArray(current);
    if (asArray.length !== 1) return null;
    const only = asArray[0];
    if (!isValidElement(only)) return null;
    if (only.type === ContentGuard) return (only.props as ContentGuardProps).error ?? null;
    if (only.type !== Fragment) return null;
    current = (only.props as { children?: ReactNode }).children;
  }
  return null;
}

function shouldHideHeaderForError(err: unknown | null): boolean {
  if (!err) return false;
  if (err instanceof ApiError) return err.status === 404 || err.status >= 500;
  return true;
}

export function DefaultPage({
  title,
  description,
  showFavoriteToggle = true,
  action,
  extra,
  sideSlots,
  children,
  className,
  contentClassName,
}: DefaultPageProps) {
  const contentGuardError = resolveContentGuardError(children);
  const hideHeader = shouldHideHeaderForError(contentGuardError);
  const leftSideSlot = hideHeader ? undefined : sideSlots?.left;
  const rightSideSlot = hideHeader ? undefined : sideSlots?.right;
  const hasSideSlots = Boolean(leftSideSlot || rightSideSlot);
  const [mobileOpenSide, setMobileOpenSide] = useState<"left" | "right" | null>(null);
  const paneToggles = useMemo(() => {
    const out: PaneToggle[] = [];
    if (leftSideSlot) out.push({ side: "left", slot: leftSideSlot });
    if (rightSideSlot) out.push({ side: "right", slot: rightSideSlot });
    return out;
  }, [leftSideSlot, rightSideSlot]);

  return (
    <AdminRouteContainer className={clsx("min-h-full min-w-0", className)}>
      {hasSideSlots ? (
        <>
          <div className="flex min-h-0 min-w-0 w-full flex-1 lg:hidden">
            <DefaultPageMainRegion
              title={hideHeader ? undefined : title}
              description={hideHeader ? undefined : description}
              titleAdornment={
                hideHeader || !title || !showFavoriteToggle ? null : <FavoriteToggle />
              }
              action={hideHeader ? undefined : action}
              extra={hideHeader ? undefined : extra}
              contentClassName={contentClassName}
              paneToggles={paneToggles}
              onOpenPane={setMobileOpenSide}
            >
              {children}
            </DefaultPageMainRegion>
          </div>

          <div
            className="hidden min-h-0 min-w-0 w-full flex-1 lg:flex"
            data-slot="default-page-shell"
          >
            {leftSideSlot ? <DefaultPageDesktopPane side="left" slot={leftSideSlot} /> : null}
            <DefaultPageMainRegion
              title={hideHeader ? undefined : title}
              description={hideHeader ? undefined : description}
              titleAdornment={
                hideHeader || !title || !showFavoriteToggle ? null : <FavoriteToggle />
              }
              action={hideHeader ? undefined : action}
              extra={hideHeader ? undefined : extra}
              contentClassName={contentClassName}
              paneToggles={[]}
              onOpenPane={() => undefined}
            >
              {children}
            </DefaultPageMainRegion>

            {rightSideSlot ? <DefaultPageDesktopPane side="right" slot={rightSideSlot} /> : null}
          </div>

          {paneToggles.map((toggle) => (
            <DefaultPageMobilePaneSheet
              key={toggle.side}
              toggle={toggle}
              open={mobileOpenSide === toggle.side}
              onOpenChange={(open) => setMobileOpenSide(open ? toggle.side : null)}
            />
          ))}
        </>
      ) : (
        <DefaultPageMainRegion
          title={hideHeader ? undefined : title}
          description={hideHeader ? undefined : description}
          titleAdornment={hideHeader || !title || !showFavoriteToggle ? null : <FavoriteToggle />}
          action={hideHeader ? undefined : action}
          extra={hideHeader ? undefined : extra}
          contentClassName={contentClassName}
          paneToggles={[]}
          onOpenPane={() => undefined}
        >
          {children}
        </DefaultPageMainRegion>
      )}
    </AdminRouteContainer>
  );
}
