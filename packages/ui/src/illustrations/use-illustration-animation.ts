import { usePrefersReducedMotion } from "@arclayer/hooks/use-prefers-reduced-motion";

/** Shared spring transition parameters. */
export const SPRING = { stiffness: 300, damping: 35 } as const;

/** Shared tween transition parameters. */
export const TWEEN = { duration: 0.6, ease: [0.2, 0, 0, 1] as const };

/** Path stroke draw animation parameters. */
export const PATH_DRAW = { duration: 0.8, ease: [0.2, 0, 0, 1] as const };

/**
 * Returns whether animations should run.
 * When either an app-level preference or the OS-level `prefers-reduced-motion`
 * is enabled, all illustration animations are skipped.
 */
export function useIllustrationAnimation(options: { userReducedMotion?: boolean } = {}) {
  const prefersReducedMotion = usePrefersReducedMotion({
    userReducedMotion: options.userReducedMotion,
  });
  return { animate: !prefersReducedMotion } as const;
}
