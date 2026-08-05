import { useEffect, useRef } from "react";

import { Button } from "@arclayer/ui/button";

type DataTableInfiniteScrollFooterProps = {
  hasMore: boolean;
  loadingMore: boolean;
  error?: unknown;
  onLoadMore: () => void;
  loadingLabel: string;
  errorLabel: string;
  className?: string;
};

export function DataTableInfiniteScrollFooter({
  hasMore,
  loadingMore,
  error,
  onLoadMore,
  loadingLabel,
  errorLabel,
  className,
}: DataTableInfiniteScrollFooterProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (!target || !hasMore || loadingMore || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadMore();
      },
      { rootMargin: "160px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <div
      ref={ref}
      className={
        className ??
        "flex min-h-11 items-center justify-center pt-3 text-callout text-label-secondary"
      }
    >
      {error ? (
        <div className="flex items-center gap-3">
          <span>{errorLabel}</span>
          <Button size="sm" variant="ghost" onClick={onLoadMore}>
            Retry
          </Button>
        </div>
      ) : loadingMore ? (
        <span>{loadingLabel}</span>
      ) : hasMore ? (
        <button type="button" className="sr-only" onClick={onLoadMore}>
          Load more rows
        </button>
      ) : null}
    </div>
  );
}
