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
} from "react";
import clsx from "clsx";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { PageSkeleton, type PageSkeletonVariant } from "@arclayer/ui/page-skeleton";

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

function resolveAdminSkeletonVariant(routeId: string | undefined, pathname: string) {
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
    routeKey.includes("/deployments") ||
    routeKey.includes("/website/releases") ||
    routeKey.includes("/website/project-releases")
  ) {
    return "table" satisfies PageSkeletonVariant;
  }

  return "form" satisfies PageSkeletonVariant;
}

function DefaultRoutePending({ variant }: { variant: PageSkeletonVariant }) {
  const { t } = useTranslation("common");

  return (
    <div
      aria-label={t("LOADING")}
      aria-live="polite"
      className="absolute inset-0 z-10 min-h-full overflow-hidden bg-background"
      role="status"
    >
      <PageSkeleton className="p-4 sm:p-6" variant={variant} />
    </div>
  );
}

export function RouteTransition({
  children,
  className,
  pendingMs = 200,
  pendingMinMs = 180,
  variant = "slide",
}: RouteTransitionProps) {
  const reducedMotion = usePrefersReducedMotion();

  const { currentPathname, pendingRouteId, resolvedPathname, isPagePending, isRouteLoading } =
    useRouterState({
      select: (s) => ({
        // We intentionally only key by pathname so that search changes (filters, pagination, etc.)
        // do not trigger a full route transition animation.
        currentPathname: s.location.pathname,
        resolvedPathname: s.resolvedLocation?.pathname ?? s.location.pathname,
        // Matches can stay pending even after `isLoading` flips; mirror router internals.
        isPagePending: s.isLoading || s.matches.some((d) => d.status === "pending"),
        isRouteLoading: s.isLoading,
        pendingRouteId: [...s.matches].reverse().find((match) => match.routeId)?.routeId,
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
          {shouldShowPending ? <DefaultRoutePending variant={pendingSkeletonVariant} /> : null}
        </RouteTransitionContext.Provider>
      </div>
    </MotionConfig>
  );
}
