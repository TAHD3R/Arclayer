import type { ComponentProps } from "react";

import type ColorBends from "@/components/ui/color-bends";

/** Shared ColorBends props for auth-scene layouts (auth / invite / setup). */
export const AUTH_SCENE_BEND_PROPS = {
  colors: ["#3b82f6"],
  rotation: 45,
  speed: 0.2,
  scale: 1,
  frequency: 1,
  warpStrength: 1,
  mouseInfluence: 1,
  parallax: 1,
  noise: 0.3,
  transparent: true,
  autoRotate: 0,
} as const satisfies Partial<ComponentProps<typeof ColorBends>>;
