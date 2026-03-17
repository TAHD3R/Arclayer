import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import clsx from "clsx";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { DefaultPage } from "@/components/common/default-page";
import { Skeleton } from "@arclayer/ui/skeleton";

type RouteTransitionProps = PropsWithChildren<{
  className?: string;
  pendingMs?: number;
  pendingMinMs?: number;
  variant?: "slide" | "fade";
}>;

function DefaultRoutePending() {
  return (
    <DefaultPage
      showFavoriteToggle={false}
      title={<Skeleton className="h-8 w-44 rounded-lg" />}
      description={
        <div className="space-y-2">
          <Skeleton className="h-4 w-[32rem] max-w-full" />
          <Skeleton className="h-4 w-[24rem] max-w-full" />
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full max-w-[52rem]" />
          <Skeleton className="h-4 w-full max-w-[48rem]" />
          <Skeleton className="h-4 w-full max-w-[50rem]" />
          <Skeleton className="h-4 w-full max-w-[44rem]" />
          <Skeleton className="h-4 w-full max-w-[46rem]" />
          <Skeleton className="h-4 w-full max-w-[40rem]" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-[54rem]" />
          <Skeleton className="h-4 w-full max-w-[42rem]" />
          <Skeleton className="h-4 w-full max-w-[49rem]" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-full max-w-[52rem]" />
          <Skeleton className="h-4 w-full max-w-[45rem]" />
          <Skeleton className="h-4 w-full max-w-[47rem]" />
        </div>
      </div>
    </DefaultPage>
  );
}

export function RouteTransition({
  children,
  className,
  pendingMs = 1000,
  pendingMinMs = 300,
  variant = "slide",
}: RouteTransitionProps) {
  const reducedMotion = usePrefersReducedMotion();

  const { resolvedPathname, isPagePending } = useRouterState({
    select: (s) => ({
      // We intentionally only key by pathname so that search changes (filters, pagination, etc.)
      // do not trigger a full route transition animation.
      resolvedPathname: s.resolvedLocation?.pathname ?? s.location.pathname,
      // Matches can stay pending even after `isLoading` flips; mirror router internals.
      isPagePending: s.isLoading || s.matches.some((d) => d.status === "pending"),
    }),
    structuralSharing: true,
  });

  // Keep rendering the last fully-resolved route while the next route is pending.
  // This avoids "blank frames" when an exit animation completes before the next
  // route finishes loading.
  const [displayedPathname, setDisplayedPathname] = useState(resolvedPathname);
  const [displayedChildren, setDisplayedChildren] = useState(children);

  useEffect(() => {
    if (isPagePending) return;
    setDisplayedPathname(resolvedPathname);
    setDisplayedChildren(children);
  }, [children, isPagePending, resolvedPathname]);

  // "Slow pending" overlay: keep it subtle by default (top progress is already shown),
  // but show a skeleton if the route is pending for long enough.
  const [showPending, setShowPending] = useState(false);
  const pendingShownAtRef = useRef<number | null>(null);
  const showPendingTimerRef = useRef<number | null>(null);
  const hidePendingTimerRef = useRef<number | null>(null);

  const transition = useMemo(
    () => ({ duration: reducedMotion ? 0.01 : 0.18, ease: [0.2, 0, 0, 1] as const }),
    [reducedMotion],
  );

  useEffect(() => {
    if (showPendingTimerRef.current) {
      window.clearTimeout(showPendingTimerRef.current);
      showPendingTimerRef.current = null;
    }

    if (hidePendingTimerRef.current) {
      window.clearTimeout(hidePendingTimerRef.current);
      hidePendingTimerRef.current = null;
    }

    if (!isPagePending) {
      if (!showPending) return;

      const shownAt = pendingShownAtRef.current;
      const elapsed = shownAt ? Date.now() - shownAt : pendingMinMs;
      const remaining = Math.max(0, pendingMinMs - elapsed);

      if (remaining === 0) {
        pendingShownAtRef.current = null;
        setShowPending(false);
        return;
      }

      hidePendingTimerRef.current = window.setTimeout(() => {
        pendingShownAtRef.current = null;
        setShowPending(false);
        hidePendingTimerRef.current = null;
      }, remaining);

      return;
    }

    if (showPending) return;

    showPendingTimerRef.current = window.setTimeout(() => {
      pendingShownAtRef.current = Date.now();
      setShowPending(true);
      showPendingTimerRef.current = null;
    }, pendingMs);
  }, [isPagePending, pendingMinMs, pendingMs, showPending]);

  return (
    <MotionConfig transition={transition}>
      <div className={clsx("relative flex h-full min-h-full min-w-0 w-full flex-col", className)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={displayedPathname}
            className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col"
            initial={
              reducedMotion
                ? { opacity: 1 }
                : variant === "fade"
                  ? { opacity: 0 }
                  : { opacity: 0, y: 6 }
            }
            animate={variant === "fade" ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={
              reducedMotion
                ? { opacity: 1 }
                : variant === "fade"
                  ? { opacity: 0 }
                  : { opacity: 0, y: -6 }
            }
          >
            {displayedChildren}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {showPending ? (
            <motion.div
              className="absolute inset-0 z-10 cursor-progress"
              // Avoid using opacity on the container to keep Skeleton readable.
              style={{ background: "var(--color-background)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-busy
              aria-live="polite"
              role="status"
            >
              <DefaultRoutePending />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
