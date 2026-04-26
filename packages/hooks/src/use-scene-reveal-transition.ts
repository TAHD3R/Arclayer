import { useLayoutEffect, useRef, useState, type MutableRefObject } from "react";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

type SceneRevealTransitionOptions<T extends string> = {
  /**
   * Whether the next route is still pending (loader/component not fully resolved).
   *
   * The overlay remains visible until the route resolves to avoid flashing the previous
   * full-viewport scene for a frame during layout swaps.
   */
  isPagePending?: boolean;
  userReducedMotion?: boolean;
  shouldUseOverlayOnSceneChange?: (previousScene: T, nextScene: T) => boolean;
};

function alwaysUseSceneOverlay() {
  return true;
}

type SwapSceneParams<T extends string> = {
  prevSceneRef: MutableRefObject<T>;
  sceneKey: T;
  reducedMotion: boolean;
  shouldUseOverlayOnSceneChange: (previousScene: T, nextScene: T) => boolean;
  setOverlayVisible: (next: boolean) => void;
  setDisplayedScene: (next: T) => void;
};

function useSwapSceneBehindOverlay<T extends string>(params: SwapSceneParams<T>): void {
  const {
    prevSceneRef,
    sceneKey,
    reducedMotion,
    shouldUseOverlayOnSceneChange,
    setOverlayVisible,
    setDisplayedScene,
  } = params;

  useLayoutEffect(() => {
    if (prevSceneRef.current === sceneKey) return;
    const previousScene = prevSceneRef.current;
    prevSceneRef.current = sceneKey;

    if (!shouldUseOverlayOnSceneChange(previousScene, sceneKey)) {
      setOverlayVisible(false);
      setDisplayedScene(sceneKey);
      return;
    }

    setOverlayVisible(true);
    if (reducedMotion) {
      setDisplayedScene(sceneKey);
      return;
    }

    const id = requestAnimationFrame(() => setDisplayedScene(sceneKey));
    return () => cancelAnimationFrame(id);
  }, [
    prevSceneRef,
    reducedMotion,
    sceneKey,
    setDisplayedScene,
    setOverlayVisible,
    shouldUseOverlayOnSceneChange,
  ]);
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
  options: SceneRevealTransitionOptions<T> = {},
) {
  const reducedMotion = usePrefersReducedMotion({ userReducedMotion: options.userReducedMotion });
  const isPagePending = options.isPagePending ?? false;

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [displayedScene, setDisplayedScene] = useState<T>(sceneKey);
  const prevSceneRef = useRef(sceneKey);
  const shouldUseOverlayOnSceneChange =
    options.shouldUseOverlayOnSceneChange ?? alwaysUseSceneOverlay;

  useSwapSceneBehindOverlay({
    prevSceneRef,
    sceneKey,
    reducedMotion,
    shouldUseOverlayOnSceneChange,
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
