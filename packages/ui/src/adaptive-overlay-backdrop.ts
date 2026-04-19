"use client";

import { useMemo } from "react";

import { usePrefersReducedMotion } from "@arclayer/hooks/use-prefers-reduced-motion";

export type AdaptiveOverlayBackdropMode = "blur" | "solid";

type NavigatorConnectionLike = {
  saveData?: boolean;
};

type AdaptiveOverlayBackdropEnvironment = {
  prefersReducedMotion: boolean;
  saveData: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
};

const LOW_END_DEVICE_MEMORY_GB = 4;
const LOW_END_CPU_CORES = 4;
export const SUBTLE_OVERLAY_BACKDROP_CLASSNAME = "bg-black/44  dark:bg-black/56";
export const STRONG_OVERLAY_BACKDROP_CLASSNAME = "bg-black/58 dark:bg-black/68";

function readAdaptiveOverlayBackdropEnvironment(
  prefersReducedMotion: boolean,
): AdaptiveOverlayBackdropEnvironment {
  if (typeof navigator === "undefined") {
    return { prefersReducedMotion, saveData: false };
  }

  const nav = navigator as Navigator & {
    connection?: NavigatorConnectionLike;
    deviceMemory?: number;
  };

  return {
    prefersReducedMotion,
    saveData: Boolean(nav.connection?.saveData),
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}

export function resolveAdaptiveOverlayBackdropMode(
  environment: AdaptiveOverlayBackdropEnvironment,
): AdaptiveOverlayBackdropMode {
  if (environment.prefersReducedMotion || environment.saveData) {
    return "solid";
  }
  if (
    typeof environment.deviceMemory === "number" &&
    environment.deviceMemory <= LOW_END_DEVICE_MEMORY_GB
  ) {
    return "solid";
  }
  if (
    typeof environment.hardwareConcurrency === "number" &&
    environment.hardwareConcurrency <= LOW_END_CPU_CORES
  ) {
    return "solid";
  }
  return "blur";
}

export function getAdaptiveOverlayBackdropClassName(mode: AdaptiveOverlayBackdropMode): string {
  return mode === "blur" ? SUBTLE_OVERLAY_BACKDROP_CLASSNAME : STRONG_OVERLAY_BACKDROP_CLASSNAME;
}

export function useAdaptiveOverlayBackdropMode(): AdaptiveOverlayBackdropMode {
  const prefersReducedMotion = usePrefersReducedMotion();

  return useMemo(() => {
    const environment = readAdaptiveOverlayBackdropEnvironment(prefersReducedMotion);
    return resolveAdaptiveOverlayBackdropMode(environment);
  }, [prefersReducedMotion]);
}

export function useAdaptiveOverlayBackdropClassName(): string {
  const mode = useAdaptiveOverlayBackdropMode();
  return getAdaptiveOverlayBackdropClassName(mode);
}
