import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SettingDialogFieldsProps = Readonly<{
  children: ReactNode;
  className?: string;
}>;

type SettingDialogFieldProps = Readonly<{
  title: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  controlClassName?: string;
}>;

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
    <div className={cn("grid min-w-0 gap-2", className)}>
      <div className={cn("grid min-w-0 gap-1", headerClassName)}>
        <div className="text-sm font-medium">{title}</div>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      <div className={cn("min-w-0 w-full", controlClassName)}>{children}</div>
      {typeof error === "string" ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : (
        (error ?? null)
      )}
    </div>
  );
}
