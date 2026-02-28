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
    <Tooltip>
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
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function DefaultPage({
  width = "fixed",
  title,
  description,
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
                  {title ? <span className="text-largetitle select-none">{title}</span> : null}
                  {title ? <FavoriteToggle /> : null}
                </div>

                {action ? <div className={styles.actionArea}>{action}</div> : null}
              </div>
            )}

            {description ? <p className="text-label-secondary select-none">{description}</p> : null}

            {extra ? <div className={styles.extra}>{extra}</div> : null}
          </header>
        )}

        {children ? <div className={clsx(styles.content, contentClassName)}>{children}</div> : null}
      </div>
    </div>
  );
}
