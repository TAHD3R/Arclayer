"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@arclayer/lib/utils";

export interface Segment {
  text: string;
  mono?: boolean;
}

export function StreamingText({
  segments = [],
  count,
  streaming,
  children,
  className,
}: {
  segments?: Segment[];
  count?: number;
  streaming: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const words = useMemo(
    () =>
      segments.flatMap((segment) =>
        segment.text.split(" ").map((word) => ({ word, mono: segment.mono ?? false })),
      ),
    [segments],
  );

  if (children !== undefined) {
    return (
      <div className={cn("relative", className)} data-streaming={streaming || undefined}>
        {children}
        {streaming && (
          <span
            aria-hidden
            className="ms-1 inline-block h-4 w-0.5 animate-pulse rounded-full bg-blue-500 align-middle dark:bg-blue-400"
          />
        )}
      </div>
    );
  }

  const visibleCount = count ?? words.length;

  return (
    <p className={cn("min-h-[8.5rem] max-w-sm text-sm leading-relaxed text-pretty", className)}>
      {words.slice(0, visibleCount).map(({ word, mono: isMono }, i) => {
        const fresh = streaming && visibleCount - 1 - i < 2;
        return (
          <span
            key={i}
            className="fade-in animate-in fill-mode-both duration-500 motion-reduce:animate-none"
          >
            <span
              className={cn(
                "transition-colors duration-700 motion-reduce:transition-none",
                fresh && "text-blue-500 dark:text-blue-400",
                isMono && "bg-foreground/[0.06] rounded-md px-1.5 py-0.5 font-mono text-[0.85em]",
              )}
            >
              {word}
            </span>{" "}
          </span>
        );
      })}
      {streaming && visibleCount > 0 && (
        <span
          aria-hidden
          className="-mb-0.5 ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400"
        />
      )}
    </p>
  );
}
