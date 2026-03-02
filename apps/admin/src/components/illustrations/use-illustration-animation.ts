import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/** 共享 spring 参数 */
export const SPRING = { stiffness: 300, damping: 35 } as const;

/** 共享 tween 参数 */
export const TWEEN = { duration: 0.6, ease: [0.2, 0, 0, 1] as const };

/** pathLength 描边动画 */
export const PATH_DRAW = { duration: 0.8, ease: [0.2, 0, 0, 1] as const };

/**
 * 返回动画是否启用。
 * 当用户开启 prefers-reduced-motion 时，所有入场动画跳过。
 */
export function useIllustrationAnimation() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return { animate: !prefersReducedMotion };
}
