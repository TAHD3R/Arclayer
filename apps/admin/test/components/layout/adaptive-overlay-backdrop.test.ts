import { describe, expect, it } from "vitest";

import {
  SUBTLE_OVERLAY_BACKDROP_CLASSNAME,
  STRONG_OVERLAY_BACKDROP_CLASSNAME,
  getAdaptiveOverlayBackdropClassName,
  resolveAdaptiveOverlayBackdropMode,
} from "@arclayer/ui/adaptive-overlay-backdrop";

describe("adaptive overlay backdrop", () => {
  it("uses a subtle dark overlay for normal capability environments without backdrop blur", () => {
    const mode = resolveAdaptiveOverlayBackdropMode({
      prefersReducedMotion: false,
      saveData: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    });

    expect(mode).toBe("blur");
    expect(getAdaptiveOverlayBackdropClassName(mode)).toBe(SUBTLE_OVERLAY_BACKDROP_CLASSNAME);
    expect(getAdaptiveOverlayBackdropClassName(mode)).not.toContain("backdrop-blur");
    expect(getAdaptiveOverlayBackdropClassName(mode)).toContain("bg-black/");
  });

  it("falls back to a stronger dark overlay for constrained environments", () => {
    const mode = resolveAdaptiveOverlayBackdropMode({
      prefersReducedMotion: false,
      saveData: true,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    });

    expect(mode).toBe("solid");
    expect(getAdaptiveOverlayBackdropClassName(mode)).toBe(STRONG_OVERLAY_BACKDROP_CLASSNAME);
    expect(getAdaptiveOverlayBackdropClassName(mode)).toContain("dark:bg-black/");
  });
});
