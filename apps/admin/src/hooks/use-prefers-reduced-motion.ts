import { usePreferencesStore } from "@/stores/use-preference-store";
import { usePrefersReducedMotion as usePrefersReducedMotionBase } from "@celestial/hooks/use-prefers-reduced-motion";

export function usePrefersReducedMotion(): boolean {
  const userReducedMotion = usePreferencesStore((s) => s.reduceMotion);
  return usePrefersReducedMotionBase({ userReducedMotion });
}
