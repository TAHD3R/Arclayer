"use client";

import type { ReactNode } from "react";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@arclayer/lib/utils";

export interface ErrorStateProps {
  title: string;
  detail: string;
  retrying: boolean;
  onRetry?: () => void;
  retryAction?: ReactNode;
  retryLabel?: string;
  retryingLabel?: string;
  className?: string;
}

export function ErrorState({
  title,
  detail,
  retrying,
  onRetry,
  retryAction,
  retryLabel = "Retry",
  retryingLabel = "Retrying",
  className,
}: ErrorStateProps) {
  if (retrying) {
    return (
      <div
        key="retrying"
        role="status"
        className={cn(
          "fade-in animate-in flex w-full max-w-sm items-center gap-2.5 text-sm duration-300 motion-reduce:animate-none",
          className,
        )}
      >
        <RefreshCwIcon className="text-foreground/45 size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="text-foreground/55 relative inline-block">
          <span>{retryingLabel}</span>
          <span
            aria-hidden
            className="shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
          >
            {retryingLabel}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      key="error"
      role="alert"
      className={cn(
        "fade-in animate-in flex w-full max-w-sm items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm duration-300 motion-reduce:animate-none dark:bg-red-500/10",
        className,
      )}
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-500/80" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-red-600 dark:text-red-400">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-red-600/60 dark:text-red-400/60">
          {detail}
        </p>
        {retryAction ? (
          <div className="mt-2 flex">{retryAction}</div>
        ) : onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            <RefreshCwIcon className="size-3" />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
