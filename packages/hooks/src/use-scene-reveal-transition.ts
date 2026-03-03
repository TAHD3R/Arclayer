import { useLayoutEffect, useRef, useState, type MutableRefObject } from "react";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

type SceneRevealTransitionOptions = {
  /**
   * Whether the next route is still pending (loader/component not fully resolved).
   *
   * The overlay remains visible until the route resolves to avoid flashing the previous
   * full-viewport scene for a frame during layout swaps.
   */
  isPagePending?: boolean;
  userReducedMotion?: boolean;
};

type SwapSceneParams<T extends string> = {
  prevSceneRef: MutableRefObject<T>;
  sceneKey: T;
  reducedMotion: boolean;
  setOverlayVisible: (next: boolean) => void;
  setDisplayedScene: (next: T) => void;
};

function useSwapSceneBehindOverlay<T extends string>(params: SwapSceneParams<T>): void {
  const { prevSceneRef, sceneKey, reducedMotion, setOverlayVisible, setDisplayedScene } = params;

  useLayoutEffect(() => {
    if (prevSceneRef.current === sceneKey) return;
    prevSceneRef.current = sceneKey;

    setOverlayVisible(true);
    if (reducedMotion) {
      setDisplayedScene(sceneKey);
      return;
    }

    const id = requestAnimationFrame(() => setDisplayedScene(sceneKey));
    return () => cancelAnimationFrame(id);
  }, [prevSceneRef, reducedMotion, sceneKey, setDisplayedScene, setOverlayVisible]);
}

type HideOverlayParams<T extends string> = {
  overlayVisible: boolean;
  displayedScene: T;
  sceneKey: T;
  reducedMotion: boolean;
  isPagePending: boolean;
  setOverlayVisible: (next: boolean) => void;
};

function useHideOverlayWhenReady<T extends string>(params: HideOverlayParams<T>): void {
  const {
    overlayVisible,
    displayedScene,
    sceneKey,
    reducedMotion,
    isPagePending,
    setOverlayVisible,
  } = params;

  useLayoutEffect(() => {
    if (!overlayVisible) return;
    if (displayedScene !== sceneKey) return;
    if (isPagePending) return;

    if (reducedMotion) {
      setOverlayVisible(false);
      return;
    }

    const id = requestAnimationFrame(() => setOverlayVisible(false));
    return () => cancelAnimationFrame(id);
  }, [displayedScene, isPagePending, overlayVisible, reducedMotion, sceneKey, setOverlayVisible]);
}

export function useSceneRevealTransition<T extends string>(
  sceneKey: T,
  options: SceneRevealTransitionOptions = {},
) {
  const reducedMotion = usePrefersReducedMotion({ userReducedMotion: options.userReducedMotion });
  const isPagePending = options.isPagePending ?? false;

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [displayedScene, setDisplayedScene] = useState<T>(sceneKey);
  const prevSceneRef = useRef(sceneKey);

  useSwapSceneBehindOverlay({
    prevSceneRef,
    sceneKey,
    reducedMotion,
    setOverlayVisible,
    setDisplayedScene,
  });

  useHideOverlayWhenReady({
    overlayVisible,
    displayedScene,
    sceneKey,
    reducedMotion,
    isPagePending,
    setOverlayVisible,
  });

  return { displayedScene, overlayVisible } as const;
}
