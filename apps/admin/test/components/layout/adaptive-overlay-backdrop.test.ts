import { describe, expect, it } from "vitest";

import {
  getAdaptiveOverlayBackdropClassName,
  resolveAdaptiveOverlayBackdropMode,
} from "@arclayer/ui/adaptive-overlay-backdrop";

describe("adaptive overlay backdrop", () => {
  it("keeps blur for normal capability environments", () => {
    const mode = resolveAdaptiveOverlayBackdropMode({
      prefersReducedMotion: false,
      saveData: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    });

    expect(mode).toBe("blur");
    expect(getAdaptiveOverlayBackdropClassName(mode)).toContain("backdrop-blur-md");
  });

  it("falls back to a solid overlay for constrained environments", () => {
    const mode = resolveAdaptiveOverlayBackdropMode({
      prefersReducedMotion: false,
      saveData: true,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    });

    expect(mode).toBe("solid");
    expect(getAdaptiveOverlayBackdropClassName(mode)).toBe("bg-background/45");
  });
});
