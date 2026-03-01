import { type ReactNode, useState } from "react";
import clsx from "clsx";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "antd";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

import { useFavoritesStore } from "@/stores/use-favorites-store";
import BookmarkIcon from "@/components/ui/icons/bookmark-icon";

import styles from "./styles/default-page.module.css";

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
        >
          <span>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
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
  return (
    <div className={clsx(styles.page, className)}>
      <div className={clsx(styles.pageInner, width === "fixed" ? styles.fixed : styles.full)}>
        {(title || description || action || extra) && (
          <header className={styles.header}>
            {(title || action) && (
              <div className={styles.titleRow}>
                <div className={clsx(styles.titleArea, "flex justify-center items-center gap-2")}>
                  {title ? <div className="text-largetitle select-none">{title}</div> : null}
                  {title && showFavoriteToggle ? <FavoriteToggle /> : null}
                </div>

                {action ? <div className={styles.actionArea}>{action}</div> : null}
              </div>
            )}

            {description ? (
              <div className="text-label-secondary select-none">{description}</div>
            ) : null}

            {extra ? <div className={styles.extra}>{extra}</div> : null}
          </header>
        )}

        {children ? <div className={clsx(styles.content, contentClassName)}>{children}</div> : null}
      </div>
    </div>
  );
}
