import { describe, expect, it } from "vitest";

import {
  SUBTLE_OVERLAY_BACKDROP_CLASSNAME,
  STRONG_OVERLAY_BACKDROP_CLASSNAME,
  getAdaptiveOverlayBackdropClassName,
  resolveAdaptiveOverlayBackdropMode,
} from "@arclayer/ui/adaptive-overlay-backdrop";

describe("adaptive overlay backdrop", () => {
  it("uses a subtle overlay for normal capability environments without backdrop blur", () => {
    const mode = resolveAdaptiveOverlayBackdropMode({
      prefersReducedMotion: false,
      saveData: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    });

    expect(mode).toBe("blur");
    expect(getAdaptiveOverlayBackdropClassName(mode)).toBe(SUBTLE_OVERLAY_BACKDROP_CLASSNAME);
    expect(getAdaptiveOverlayBackdropClassName(mode)).not.toContain("backdrop-blur");
  });

  it("falls back to a solid overlay for constrained environments", () => {
    const mode = resolveAdaptiveOverlayBackdropMode({
      prefersReducedMotion: false,
      saveData: true,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    });

    expect(mode).toBe("solid");
    expect(getAdaptiveOverlayBackdropClassName(mode)).toBe(STRONG_OVERLAY_BACKDROP_CLASSNAME);
  });
});
