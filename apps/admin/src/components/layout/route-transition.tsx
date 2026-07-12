import { useProgress } from "@bprogress/react";
import { useRouterState } from "@tanstack/react-router";
import { Skeleton as BoneyardSkeleton } from "boneyard-js/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import clsx from "clsx";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { toBoneyardRouteName } from "@/lib/boneyard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { Skeleton as UISkeleton } from "@arclayer/ui/skeleton";

type RouteTransitionProps = PropsWithChildren<{
  className?: string;
  pendingMs?: number;
  pendingMinMs?: number;
  variant?: "slide" | "fade";
}>;

type RouteTransitionState = {
  settled: boolean;
};

const RouteTransitionContext = createContext<RouteTransitionState>({ settled: true });

export function useRouteTransitionState() {
  return useContext(RouteTransitionContext);
}

function useRouteLoadingProgress(isRouteLoading: boolean) {
  const { start, stop } = useProgress();
  const startedRef = useRef(false);

  useEffect(() => {
    if (isRouteLoading && !startedRef.current) {
      startedRef.current = true;
      start();
      return;
    }

    if (!isRouteLoading && startedRef.current) {
      startedRef.current = false;
      stop();
    }
  }, [isRouteLoading, start, stop]);

  useEffect(() => {
    return () => {
      if (!startedRef.current) {
        return;
      }
      startedRef.current = false;
      stop();
    };
  }, [stop]);
}

function DefaultRoutePending() {
  return (
    <div aria-live="polite" className="min-h-full" role="status">
      <DefaultPage
        showFavoriteToggle={false}
        title={<UISkeleton className="h-8 w-44 rounded-lg" />}
        description={
          <div className="flex flex-col gap-2">
            <UISkeleton className="h-4 w-[32rem] max-w-full" />
            <UISkeleton className="h-4 w-[24rem] max-w-full" />
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <UISkeleton className="h-4 w-full max-w-[52rem]" />
            <UISkeleton className="h-4 w-full max-w-[48rem]" />
            <UISkeleton className="h-4 w-full max-w-[50rem]" />
            <UISkeleton className="h-4 w-full max-w-[44rem]" />
            <UISkeleton className="h-4 w-full max-w-[46rem]" />
            <UISkeleton className="h-4 w-full max-w-[40rem]" />
          </div>

          <div className="flex flex-col gap-3">
            <UISkeleton className="h-5 w-40" />
            <UISkeleton className="h-4 w-full max-w-[54rem]" />
            <UISkeleton className="h-4 w-full max-w-[42rem]" />
            <UISkeleton className="h-4 w-full max-w-[49rem]" />
          </div>

          <div className="flex flex-col gap-3">
            <UISkeleton className="h-5 w-36" />
            <UISkeleton className="h-4 w-full max-w-[52rem]" />
            <UISkeleton className="h-4 w-full max-w-[45rem]" />
            <UISkeleton className="h-4 w-full max-w-[47rem]" />
          </div>
        </div>
      </DefaultPage>
    </div>
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

  const { currentPathname, currentRouteId, resolvedPathname, isPagePending, isRouteLoading } =
    useRouterState({
      select: (s) => ({
        // We intentionally only key by pathname so that search changes (filters, pagination, etc.)
        // do not trigger a full route transition animation.
        currentPathname: s.location.pathname,
        resolvedPathname: s.resolvedLocation?.pathname ?? s.location.pathname,
        // Matches can stay pending even after `isLoading` flips; mirror router internals.
        isPagePending: s.isLoading || s.matches.some((d) => d.status === "pending"),
        isRouteLoading: s.isLoading,
        currentRouteId: s.matches.at(-1)?.routeId,
      }),
      structuralSharing: true,
    });
  useRouteLoadingProgress(isRouteLoading);

  // Key route animations by the last resolved pathname, but keep children live.
  // Freezing children during pending renders stale page content inside the next
  // route shell for a frame on fast intra-scene navigation.
  const [displayedPathname, setDisplayedPathname] = useState(resolvedPathname);
  // Same-route pending stays subtle by default. Path changes must cover during
  // render because the router location can advance before Outlet or pending
  // state resolves, otherwise stale route content is visible for one frame.
  const isCrossRoutePending = isPagePending && currentPathname !== resolvedPathname;
  const hasUnresolvedPathSwitch = currentPathname !== displayedPathname;
  const [routeAnimationSettled, setRouteAnimationSettled] = useState(true);
  const displayedPathnameRef = useRef(displayedPathname);
  const resolvedPathnameRef = useRef(resolvedPathname);
  const isPagePendingRef = useRef(isPagePending);
  const routeTransitionState = useMemo(
    () => ({
      settled:
        routeAnimationSettled &&
        !isPagePending &&
        !hasUnresolvedPathSwitch &&
        displayedPathname === resolvedPathname,
    }),
    [
      displayedPathname,
      hasUnresolvedPathSwitch,
      isPagePending,
      resolvedPathname,
      routeAnimationSettled,
    ],
  );

  displayedPathnameRef.current = displayedPathname;
  resolvedPathnameRef.current = resolvedPathname;
  isPagePendingRef.current = isPagePending;

  useEffect(() => {
    if (isPagePending) return;
    setDisplayedPathname(resolvedPathname);
  }, [isPagePending, resolvedPathname]);

  useEffect(() => {
    if (isPagePending || hasUnresolvedPathSwitch || displayedPathname !== resolvedPathname) {
      setRouteAnimationSettled(false);
    }
  }, [displayedPathname, hasUnresolvedPathSwitch, isPagePending, resolvedPathname]);

  const [showPending, setShowPending] = useState(false);
  const shouldShowPending = showPending || hasUnresolvedPathSwitch;
  const skeletonName = toBoneyardRouteName(currentRouteId, currentPathname);
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

    if (isCrossRoutePending || hasUnresolvedPathSwitch) {
      pendingShownAtRef.current ??= Date.now();
      setShowPending(true);
      return;
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
  }, [
    hasUnresolvedPathSwitch,
    isCrossRoutePending,
    isPagePending,
    pendingMinMs,
    pendingMs,
    showPending,
  ]);

  return (
    <MotionConfig transition={transition}>
      <div className={clsx("relative flex min-h-0 min-w-0 w-full flex-1 flex-col", className)}>
        <RouteTransitionContext.Provider value={routeTransitionState}>
          <BoneyardSkeleton
            animate={reducedMotion ? "solid" : "shimmer"}
            className="admin-route-boneyard min-h-0 min-w-0 w-full flex-1 bg-background"
            fallback={<DefaultRoutePending />}
            loading={shouldShowPending}
            name={skeletonName}
            select="viewport"
            transition={reducedMotion ? false : 180}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={displayedPathname}
                className="flex min-h-0 min-w-0 w-full flex-1 flex-col"
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
                onAnimationStart={() => {
                  setRouteAnimationSettled(false);
                }}
                onAnimationComplete={() => {
                  if (
                    displayedPathname === displayedPathnameRef.current &&
                    displayedPathname === resolvedPathnameRef.current &&
                    !isPagePendingRef.current
                  ) {
                    setRouteAnimationSettled(true);
                  }
                }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </BoneyardSkeleton>
        </RouteTransitionContext.Provider>
      </div>
    </MotionConfig>
  );
}
