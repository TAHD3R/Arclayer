import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

type SettingDialogFieldsProps = {
  children: ReactNode;
  className?: string;
};

type SettingDialogFieldProps = {
  title: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  controlClassName?: string;
};

export function SettingDialogFields({ children, className }: SettingDialogFieldsProps) {
  return <div className={cn("grid gap-5", className)}>{children}</div>;
}

export function SettingDialogField({
  title,
  description,
  error,
  children,
  className,
  headerClassName,
  controlClassName,
}: SettingDialogFieldProps) {
  return (
    <div className={cn("grid min-w-0 gap-3", className)}>
      <div className={cn("grid min-w-0 gap-1", headerClassName)}>
        <div className="text-headline text-label-primary">{title}</div>
        {description ? <div className="text-label-secondary">{description}</div> : null}
      </div>
      <div className={cn("min-w-0 w-full", controlClassName)}>{children}</div>
      {typeof error === "string" ? (
        <div className="text-footnote text-destructive">{error}</div>
      ) : (
        (error ?? null)
      )}
    </div>
  );
}
