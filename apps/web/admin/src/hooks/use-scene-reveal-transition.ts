import { useLayoutEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Manages a full-screen overlay that hides layout flicker during scene transitions.
 *
 * Flow:
 *  1. sceneKey changes → overlayVisible = true (instant cover)
 *  2. Next frame: displayedScene updates (layout swap hidden behind overlay)
 *  3. After layout swap: overlayVisible = false (200ms fade-out reveals new layout)
 */
export function useSceneRevealTransition<T extends string>(sceneKey: T) {
  const reducedMotion = usePrefersReducedMotion();
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [displayedScene, setDisplayedScene] = useState<T>(sceneKey);
  const prevSceneRef = useRef(sceneKey);

  useLayoutEffect(() => {
    if (prevSceneRef.current === sceneKey) return;
    prevSceneRef.current = sceneKey;

    if (reducedMotion) {
      setDisplayedScene(sceneKey);
      return;
    }

    // Step 1: show overlay immediately
    setOverlayVisible(true);

    // Step 2: swap layout behind the overlay on next frame
    requestAnimationFrame(() => {
      setDisplayedScene(sceneKey);
      // Step 3: reveal new layout after one more frame (layout has painted)
      requestAnimationFrame(() => {
        setOverlayVisible(false);
      });
    });
  }, [reducedMotion, sceneKey]);

  return { displayedScene, overlayVisible };
}
