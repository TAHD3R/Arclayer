import {
  Children,
  Fragment,
  isValidElement,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@arclayer/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { PanelLeftOpen, PanelRightOpen, Star } from "lucide-react";

import { ContentGuard, type ContentGuardProps } from "@/layouts/page-shell/content-guard";
import { ApiError } from "@/lib/http";
import { useFavoritesStore } from "@/stores/use-favorites-store";

export type BasePageProps = {
  title?: ReactNode;
  titleTooltip?: string;
  description?: ReactNode;
  showFavoriteToggle?: boolean;
  favoritePath?: string;
  afterFavorite?: ReactNode;
  headerVisibility?: "auto" | "always";
  action?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  contentContainerClassName?: string;
  headerBehavior?: "normal" | "sticky";
};

export type PagePaneToggle = {
  side: "left" | "right";
  label: ReactNode;
};

function FavoriteToggle(props: { path?: string }) {
  const { t } = useTranslation(["common"]);
  const currentPath = useRouterState({
    select: (s) => `${s.location.pathname}${s.location.searchStr}`,
  });
  const favoritePath = props.path ?? currentPath;
  const paths = useFavoritesStore((s) => s.paths);
  const toggle = useFavoritesStore((s) => s.toggle);
  const isFavorited = paths.includes(favoritePath);
  const [hovered, setHovered] = useState(false);
  const actionLabel = isFavorited ? t("common:FAVORITE_REMOVE") : t("common:FAVORITE_ADD");

  return (
    <Tooltip side="bottom">
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={actionLabel}
          onClick={() => toggle(favoritePath)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={clsx(
            "shrink-0  transition-colors",
            "text-label-secondary hover:text-label-primary",
            isFavorited &&
              "text-amber-500 hover:text-amber-500 dark:text-amber-300 dark:hover:text-amber-300",
          )}
        >
          <span className="inline-flex items-center justify-center">
            <Star
              size={16}
              strokeWidth={2}
              className={clsx(
                "transition-colors",
                hovered || isFavorited ? "fill-current" : "fill-transparent",
              )}
            />
          </span>
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

function isElementTruncated(element: HTMLElement | null) {
  if (!element) return false;
  return (
    element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
  );
}

export function getPageTitleTooltipLabel(title: ReactNode): string | undefined {
  if (typeof title === "string") return title.trim() || undefined;
  if (typeof title === "number") return String(title);
  return undefined;
}

function PageTitle(props: { children: ReactNode; tooltip?: string }) {
  const titleRef = useRef<HTMLDivElement | null>(null);
  const [truncated, setTruncated] = useState(false);
  const measure = useCallback(() => {
    setTruncated(isElementTruncated(titleRef.current));
  }, []);
  const titleNode = (
    <div
      ref={titleRef}
      className="min-w-0 max-w-full truncate text-title text-label-primary select-none"
      data-slot="page-title"
    >
      {props.children}
    </div>
  );

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const element = titleRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, props.children]);

  if (!props.tooltip || !truncated) return titleNode;

  return (
    <Tooltip align="start" side="bottom">
      <TooltipTrigger asChild>{titleNode}</TooltipTrigger>
      <TooltipContent className="max-w-96 text-left">{props.tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function shouldHidePageHeader(children: ReactNode): boolean {
  return shouldHideHeaderForError(resolveContentGuardError(children));
}

export function PageMainRegion(props: {
  title?: ReactNode;
  titleTooltip?: string;
  description?: ReactNode;
  showFavoriteToggle?: boolean;
  favoritePath?: string;
  afterFavorite?: ReactNode;
  action?: ReactNode;
  extra?: ReactNode;
  contentClassName?: string;
  contentContainerClassName?: string;
  paneToggles?: PagePaneToggle[];
  onOpenPane?: (side: "left" | "right") => void;
  fillAvailableHeight?: boolean;
  headerBehavior?: "normal" | "sticky";
  children?: ReactNode;
}) {
  const paneToggles = props.paneToggles ?? [];
  const onOpenPane = props.onOpenPane ?? (() => undefined);
  const fillAvailableHeight = props.fillAvailableHeight ?? true;
  const titleAdornment =
    props.title && props.showFavoriteToggle !== false ? (
      <FavoriteToggle path={props.favoritePath} />
    ) : null;
  const afterFavorite = props.title && titleAdornment ? props.afterFavorite : null;
  const stickyHeader = props.headerBehavior === "sticky";

  return (
    <div
      className={clsx(
        "flex min-h-0 min-w-0 w-full flex-col",
        fillAvailableHeight && "flex-1",
        props.contentClassName,
      )}
      data-slot="page-main-region"
    >
      <div
        className={clsx(
          "flex min-h-0 min-w-0 w-full flex-col",
          fillAvailableHeight && "flex-1",
          props.contentContainerClassName,
        )}
        data-slot="page-main-container"
      >
        {props.title ||
        props.description ||
        props.action ||
        props.extra ||
        paneToggles.length > 0 ? (
          <header
            className={clsx(
              "mb-4",
              stickyHeader &&
                "sticky top-0 z-20 -mx-[var(--admin-route-gutter-x)] min-h-[var(--settings-page-sticky-header-height,6rem)] bg-background/95 px-[var(--admin-route-gutter-x)] py-2 backdrop-blur supports-[backdrop-filter]:bg-background/88",
            )}
          >
            {props.title || props.action || paneToggles.length > 0 ? (
              <div className="flex items-center justify-between gap-4">
                <div className="my-2 flex min-w-0 flex-1 items-end gap-2">
                  {props.title ? (
                    <PageTitle tooltip={props.titleTooltip}>{props.title}</PageTitle>
                  ) : null}
                  {titleAdornment}
                  {afterFavorite}
                </div>
                <div className="inline-flex shrink-0 items-center gap-2.5">
                  {paneToggles.length > 0 ? (
                    <div className="inline-flex items-center gap-1 lg:hidden">
                      {paneToggles.map((toggle) => (
                        <Button
                          key={toggle.side}
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenPane(toggle.side)}
                          aria-label={String(toggle.label)}
                        >
                          {toggle.side === "left" ? (
                            <PanelLeftOpen className="size-4" />
                          ) : (
                            <PanelRightOpen className="size-4" />
                          )}
                          <span className="sr-only">{toggle.label}</span>
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {props.action}
                </div>
              </div>
            ) : null}
            {props.description ? (
              <div className="text-body text-label-secondary select-none max-w-2xl">
                {props.description}
              </div>
            ) : null}
            {props.extra ? <div className="mt-3.5">{props.extra}</div> : null}
          </header>
        ) : null}
        {props.children ? (
          <div className="min-h-0 min-w-0 w-full flex-1" data-slot="page-content">
            {props.children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
