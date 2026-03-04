import { Children, Fragment, isValidElement, type ReactNode, useState } from "react";
import clsx from "clsx";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "antd";
import { Tooltip, TooltipTrigger, TooltipContent } from "@celestial/ui/tooltip";

import { ApiError } from "@/lib/http";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import BookmarkIcon from "@celestial/ui/icons/bookmark-icon";
import { AdminRouteContainer } from "@/components/layout/admin-route-container";
import { ContentGuard, type ContentGuardProps } from "@/components/common/content-guard";

export type DefaultPageWidth = "fixed" | "full";

export type DefaultPageProps = {
  width?: DefaultPageWidth;
  title?: ReactNode;
  description?: ReactNode;
  /**
   * Whether to show the built-in favorite toggle next to title.
   * Default: true (existing behavior).
   *
   * Some pages (e.g. skeleton / pending state) may want a title layout without interactive controls.
   */
  showFavoriteToggle?: boolean;
  action?: ReactNode;
  extra?: ReactNode;
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

  const label = isFavorited ? t("common:FAVORITE_REMOVE") : t("common:FAVORITE_ADD");
  const tooltip = isFavorited
    ? t("common:FAVORITE_REMOVE_TOOLTIP")
    : t("common:FAVORITE_ADD_TOOLTIP");

  return (
    <Tooltip side="bottom">
      <TooltipTrigger asChild>
        <Button
          type="text"
          icon={
            <BookmarkIcon size={16} strokeWidth={2} isHovered={hovered} isFilled={isFavorited} />
          }
          onClick={() => toggle(pathname)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={clsx(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
            "text-label-secondary hover:text-foreground",
            isFavorited && "text-amber-500 hover:text-amber-600",
          )}
          autoInsertSpace={false}
        >
          <span>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
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

    if (only.type === ContentGuard) {
      const props = only.props as ContentGuardProps;
      return props.error ?? null;
    }

    if (only.type === Fragment) {
      current = (only.props as { children?: ReactNode }).children;
      continue;
    }

    return null;
  }

  return null;
}

function shouldHideHeaderForError(err: unknown | null): boolean {
  if (!err) return false;
  if (err instanceof ApiError) return err.status === 404 || err.status >= 500;
  return true;
}

export function DefaultPage({
  width = "fixed",
  title,
  description,
  showFavoriteToggle = true,
  action,
  extra,
  children,
  className,
  contentClassName,
}: DefaultPageProps) {
  const contentGuardError = resolveContentGuardError(children);
  const hideHeader = shouldHideHeaderForError(contentGuardError);

  return (
    <AdminRouteContainer width={width} className={clsx("h-full", className)}>
      {!hideHeader && (title || description || action || extra) && (
        <header className="mb-[18px]">
          {(title || action) && (
            <div className="flex items-center justify-between gap-4">
              <div className={clsx("min-w-0 my-2", "flex justify-center items-center gap-2")}>
                {title ? <div className="text-largetitle select-none">{title}</div> : null}
                {title && showFavoriteToggle ? <FavoriteToggle /> : null}
              </div>

              {action ? (
                <div className="shrink-0 inline-flex items-center gap-2.5">{action}</div>
              ) : null}
            </div>
          )}

          {description ? (
            <div className="text-label-secondary select-none">{description}</div>
          ) : null}

          {extra ? <div className="mt-3.5">{extra}</div> : null}
        </header>
      )}

      {children ? (
        <div className={clsx("min-w-0 flex-1 min-h-0", contentClassName)}>{children}</div>
      ) : null}
    </AdminRouteContainer>
  );
}
