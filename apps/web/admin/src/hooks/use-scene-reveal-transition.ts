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
export function useSceneRevealTransition<T extends string>(
  sceneKey: T,
  options?: {
    /**
     * Whether the next route is still pending (loader/component not fully resolved).
     *
     * We intentionally keep the overlay visible until the route is resolved so that
     * the previous scene (e.g. editor's full-viewport layout) doesn't flash for one frame.
     */
    isPagePending?: boolean;
  },
) {
  const reducedMotion = usePrefersReducedMotion();
  const isPagePending = options?.isPagePending ?? false;

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [displayedScene, setDisplayedScene] = useState<T>(sceneKey);
  const prevSceneRef = useRef(sceneKey);

  // Step 1 + 2: show overlay immediately and swap layout on the next frame.
  useLayoutEffect(() => {
    if (prevSceneRef.current === sceneKey) return;
    prevSceneRef.current = sceneKey;

    setOverlayVisible(true);

    if (reducedMotion) {
      setDisplayedScene(sceneKey);
      return;
    }

    const id = requestAnimationFrame(() => {
      setDisplayedScene(sceneKey);
    });

    return () => {
      cancelAnimationFrame(id);
    };
  }, [reducedMotion, sceneKey]);

  // Step 3: only hide overlay after the new scene is mounted AND the route is resolved.
  useLayoutEffect(() => {
    if (!overlayVisible) return;
    if (displayedScene !== sceneKey) return;
    if (isPagePending) return;

    if (reducedMotion) {
      setOverlayVisible(false);
      return;
    }

    const id = requestAnimationFrame(() => {
      // Avoid re-showing the overlay during normal in-scene route transitions.
      // Only hide it here when the new scene is ready to be revealed.
      setOverlayVisible(false);
    });

    return () => {
      cancelAnimationFrame(id);
    };
  }, [displayedScene, isPagePending, overlayVisible, reducedMotion, sceneKey]);

  return { displayedScene, overlayVisible };
}
