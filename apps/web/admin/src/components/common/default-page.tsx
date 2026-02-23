import { type ReactNode } from "react";
import clsx from "clsx";

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
                <div className={styles.titleArea}>
                  {title ? <span className="text-largetitle">{title}</span> : null}
                </div>

                {action ? <div className={styles.actionArea}>{action}</div> : null}
              </div>
            )}

            {description ? <p className="text-label-secondary">{description}</p> : null}

            {extra ? <div className={styles.extra}>{extra}</div> : null}
          </header>
        )}

        {children ? <div className={clsx(styles.content, contentClassName)}>{children}</div> : null}
      </div>
    </div>
  );
}
