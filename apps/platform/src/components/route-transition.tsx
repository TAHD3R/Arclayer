import { useProgress } from "@bprogress/react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

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

  useEffect(
    () => () => {
      if (!startedRef.current) return;
      startedRef.current = false;
      stop();
    },
    [stop],
  );
}

export function RouteTransition({ children }: { children: ReactNode }) {
  const { isRouteLoading, resolvedPathname } = useRouterState({
    select: (state) => ({
      isRouteLoading: state.isLoading,
      resolvedPathname: state.resolvedLocation?.pathname ?? state.location.pathname,
    }),
    structuralSharing: true,
  });
  useRouteLoadingProgress(isRouteLoading);

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}>
      <div
        aria-busy={isRouteLoading}
        className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col bg-background"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={resolvedPathname}
            animate={{ y: 0 }}
            className="flex min-h-0 min-w-0 w-full flex-1 flex-col"
            data-slot="route-content"
            exit={{ y: -2 }}
            initial={{ y: 4 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
