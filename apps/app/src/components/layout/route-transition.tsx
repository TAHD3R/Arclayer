import { useProgress } from "@bprogress/react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import clsx from "clsx";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { PageSkeleton, type PageSkeletonVariant } from "@arclayer/ui/page-skeleton";

type RouteTransitionProps = PropsWithChildren<{
  className?: string;
  pendingMs?: number;
  pendingMinMs?: number;
  pendingFallback?: ReactNode;
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

export function resolveAdminSkeletonVariant(routeId: string | undefined, pathname: string) {
  const routeKey = routeId ?? pathname;

  if (
    routeKey.includes("/editor") ||
    routeKey.includes("/content/site-builder") ||
    routeKey.includes("/content/library/$itemId") ||
    routeKey.includes("/content/models/edit") ||
    routeKey.includes("/customization/skills") ||
    routeKey.includes("/customization/design-systems")
  ) {
    return "split-detail" satisfies PageSkeletonVariant;
  }

  if (
    routeKey === "/" ||
    /^\/projects\/?$/.test(routeKey) ||
    routeKey.includes("/inspriation") ||
    routeKey.includes("/assets") ||
    /^\/customization\/?$/.test(routeKey)
  ) {
    return "card-grid" satisfies PageSkeletonVariant;
  }

  if (
    routeKey.includes("/notifications") ||
    routeKey.includes("/invitations") ||
    routeKey.includes("/activity") ||
    routeKey.includes("/content/library") ||
    routeKey.includes("/content/models") ||
    routeKey.includes("/website/project-releases")
  ) {
    return "table" satisfies PageSkeletonVariant;
  }

  return "form" satisfies PageSkeletonVariant;
}

function DefaultRoutePending({
  variant,
  children,
}: PropsWithChildren<{ variant: PageSkeletonVariant }>) {
  const { t } = useTranslation("common");

  return (
    <div
      aria-label={t("LOADING")}
      aria-live="polite"
      className={clsx(
        "absolute inset-0 z-10 min-h-full overflow-hidden",
        children ? "bg-transparent" : "bg-background",
      )}
      role="status"
    >
      {children ?? <PageSkeleton className="p-4 sm:p-6" variant={variant} />}
    </div>
  );
}

export function RouteTransition({
  children,
  className,
  pendingMs = 200,
  pendingMinMs = 180,
  pendingFallback,
  variant = "slide",
}: RouteTransitionProps) {
  const reducedMotion = usePrefersReducedMotion();

  const { currentPathname, pendingRouteId, isPagePending, isRouteLoading } = useRouterState({
    select: (s) => ({
      // We intentionally only key by pathname so that search changes (filters, pagination, etc.)
      // do not trigger a full route transition animation.
      currentPathname: s.location.pathname,
      // Matches can stay pending even after `isLoading` flips; mirror router internals.
      isPagePending: s.isLoading || s.matches.some((d) => d.status === "pending"),
      isRouteLoading: s.isLoading,
      pendingRouteId: [...s.matches].reverse().find((match) => match.routeId)?.routeId,
    }),
    structuralSharing: true,
  });
  useRouteLoadingProgress(isRouteLoading);

  // Key route animations by the current pathname, but keep children live. While a
  // navigation is pending the optimistic pathname already points at the target
  // route, yet the rendered match chain (and thus children) is still the old
  // page — keeping the old key keeps the old content mounted and visible for the
  // delay window instead of flashing a skeleton.
  const [displayedPathname, setDisplayedPathname] = useState(currentPathname);
  // Sync the animation key during render so a committed route never paints under
  // a stale key; a passive effect here leaves one frame of new content inside
  // the old key's motion.div.
  if (!isPagePending && displayedPathname !== currentPathname) {
    setDisplayedPathname(currentPathname);
  }
  // A pending navigation whose target pathname has not been displayed yet.
  const hasUnresolvedPathSwitch = currentPathname !== displayedPathname;
  const isNavigating = isPagePending || hasUnresolvedPathSwitch;
  const [routeAnimationSettled, setRouteAnimationSettled] = useState(true);
  const displayedPathnameRef = useRef(displayedPathname);
  const isPagePendingRef = useRef(isPagePending);
  const routeTransitionState = useMemo(
    () => ({
      settled: routeAnimationSettled && !isPagePending && !hasUnresolvedPathSwitch,
    }),
    [hasUnresolvedPathSwitch, isPagePending, routeAnimationSettled],
  );

  displayedPathnameRef.current = displayedPathname;
  isPagePendingRef.current = isPagePending;

  useEffect(() => {
    if (isPagePending || hasUnresolvedPathSwitch || displayedPathname !== currentPathname) {
      setRouteAnimationSettled(false);
    }
  }, [currentPathname, displayedPathname, hasUnresolvedPathSwitch, isPagePending]);

  const [showPending, setShowPending] = useState(false);
  const shouldShowPending = showPending;
  const pendingShownAtRef = useRef<number | null>(null);
  const showPendingTimerRef = useRef<number | null>(null);
  const hidePendingTimerRef = useRef<number | null>(null);
  const pendingSkeletonVariant = resolveAdminSkeletonVariant(pendingRouteId, currentPathname);

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

    if (isNavigating) {
      // Delay the skeleton: fast (cached) navigations resolve inside the window
      // and stay a seamless swap with no loading state at all.
      if (showPending) {
        pendingShownAtRef.current ??= Date.now();
        return;
      }
      showPendingTimerRef.current = window.setTimeout(() => {
        pendingShownAtRef.current = Date.now();
        setShowPending(true);
        showPendingTimerRef.current = null;
      }, pendingMs);
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
  }, [isNavigating, isPagePending, pendingMinMs, pendingMs, showPending]);

  useEffect(
    () => () => {
      if (showPendingTimerRef.current) {
        window.clearTimeout(showPendingTimerRef.current);
      }
      if (hidePendingTimerRef.current) {
        window.clearTimeout(hidePendingTimerRef.current);
      }
    },
    [],
  );

  return (
    <MotionConfig transition={transition}>
      <div
        aria-busy={shouldShowPending}
        className={clsx("relative flex min-h-0 min-w-0 w-full flex-1 flex-col", className)}
      >
        <RouteTransitionContext.Provider value={routeTransitionState}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={displayedPathname}
              aria-hidden={shouldShowPending || undefined}
              className={clsx(
                "flex min-h-0 min-w-0 w-full flex-1 flex-col",
                shouldShowPending && "invisible pointer-events-none",
              )}
              data-slot="route-content"
              inert={shouldShowPending || undefined}
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
                  !isPagePendingRef.current
                ) {
                  setRouteAnimationSettled(true);
                }
              }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
          {shouldShowPending ? (
            <DefaultRoutePending variant={pendingSkeletonVariant}>
              {pendingFallback}
            </DefaultRoutePending>
          ) : null}
        </RouteTransitionContext.Provider>
      </div>
    </MotionConfig>
  );
}
