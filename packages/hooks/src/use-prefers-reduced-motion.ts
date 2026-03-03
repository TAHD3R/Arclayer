import { useMediaPrefersReducedMotion } from "./use-media-prefers-reduced-motion";

export type UsePrefersReducedMotionOptions = {
  /**
   * Optional user-level preference (e.g. app setting).
   * When true, always treats reduced motion as enabled.
   */
  userReducedMotion?: boolean;
};

export function usePrefersReducedMotion(options: UsePrefersReducedMotionOptions = {}): boolean {
  const mediaReducedMotion = useMediaPrefersReducedMotion();
  return Boolean(options.userReducedMotion) || mediaReducedMotion;
}
