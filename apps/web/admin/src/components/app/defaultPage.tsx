import { type ReactNode } from "react";
import { Typography } from "antd";
import clsx from "clsx";

import styles from "./styles/defaultPage.module.css";

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
                  {title ? (
                    <Typography.Title level={2} style={{ margin: 0 }}>
                      {title}
                    </Typography.Title>
                  ) : null}
                </div>

                {action ? <div className={styles.actionArea}>{action}</div> : null}
              </div>
            )}

            {description ? (
              <Typography.Paragraph className={styles.description}>
                {description}
              </Typography.Paragraph>
            ) : null}

            {extra ? <div className={styles.extra}>{extra}</div> : null}
          </header>
        )}

        {children ? <div className={clsx(styles.content, contentClassName)}>{children}</div> : null}
      </div>
    </div>
  );
}
