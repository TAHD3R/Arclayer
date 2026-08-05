import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";

const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<EventListener>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: REDUCED_MOTION_MEDIA_QUERY,
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: EventListener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: EventListener) =>
      listeners.delete(listener),
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      expect(query).toBe(REDUCED_MOTION_MEDIA_QUERY);
      return mediaQueryList;
    }),
  );

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: REDUCED_MOTION_MEDIA_QUERY } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaPrefersReducedMotion", () => {
  it("returns the active media preference on the first render", () => {
    installMatchMedia(true);
    const renderedValues: boolean[] = [];

    const { result } = renderHook(() => {
      const reducedMotion = useMediaPrefersReducedMotion();
      renderedValues.push(reducedMotion);
      return reducedMotion;
    });

    expect(renderedValues[0]).toBe(true);
    expect(result.current).toBe(true);
  });

  it("keeps the preference synchronized with media-query changes", () => {
    const media = installMatchMedia(true);
    const { result } = renderHook(() => useMediaPrefersReducedMotion());

    act(() => media.setMatches(false));

    expect(result.current).toBe(false);
  });
});
