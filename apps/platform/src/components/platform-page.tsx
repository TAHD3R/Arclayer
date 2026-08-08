import type { ReactNode } from "react";

function classes(base: string, className?: string): string {
  return className ? `${base} ${className}` : base;
}

export function PlatformPage({
  title,
  description,
  primaryAction,
  secondaryActions,
  extra,
  children,
  className,
}: Readonly<{
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={classes(
        "mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7",
        className,
      )}
    >
      <PageHeader
        description={description}
        extra={extra}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        title={title}
      />
      {children}
    </div>
  );
}

/** Canonical Platform page header. Keep page actions here so every route has the same rhythm. */
export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  extra,
}: Readonly<{
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  extra?: ReactNode;
}>) {
  return (
    <header className="space-y-4 border-b pb-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {primaryAction || secondaryActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </div>
      {extra ? <div>{extra}</div> : null}
    </header>
  );
}

export function PlatformToolbar({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={classes(
        "flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-xs sm:flex-row sm:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PlatformSection({
  title,
  description,
  actions,
  children,
  className,
}: Readonly<{
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section className={classes("space-y-4", className)}>
      {title || description || actions ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? <h2 className="text-2xl font-semibold tracking-tight">{title}</h2> : null}
            {description ? (
              <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PlatformSurface({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={classes("overflow-hidden rounded-lg border bg-card shadow-xs", className)}>
      {children}
    </div>
  );
}
