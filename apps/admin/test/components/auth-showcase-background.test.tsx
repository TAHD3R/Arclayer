import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthShowcaseBackground } from "@/components/auth-showcase-background";

const { reducedMotionState, preferencesState } = vi.hoisted(() => ({
  reducedMotionState: { value: false },
  preferencesState: { themeMode: "light" as "light" | "dark" },
}));

vi.mock("@/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => reducedMotionState.value,
}));

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: typeof preferencesState) => unknown) =>
    selector(preferencesState),
}));

vi.mock("@/components/Aurora", () => ({
  default: ({
    colorStops,
    amplitude,
    blend,
    speed,
    luminanceLift,
  }: {
    colorStops: [string, string, string];
    amplitude: number;
    blend: number;
    speed: number;
    luminanceLift: number;
  }) => (
    <div
      data-testid="aurora"
      data-color-stops={JSON.stringify(colorStops)}
      data-amplitude={amplitude}
      data-blend={blend}
      data-speed={speed}
      data-luminance-lift={luminanceLift}
    />
  ),
}));

vi.mock("@/components/CardSwap", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="card-swap">{children}</div>,
  Card: ({ children, customClass }: { children: ReactNode; customClass?: string }) => (
    <div data-testid="card-swap-card" className={customClass}>
      {children}
    </div>
  ),
}));

describe("AuthShowcaseBackground", () => {
  beforeEach(() => {
    reducedMotionState.value = false;
    preferencesState.themeMode = "light";
  });

  it("stacks Aurora and Card Swap behind the focus veil", () => {
    render(<AuthShowcaseBackground />);

    const auroraLayer = screen.getByTestId("auth-background-aurora");
    const cardLayer = screen.getByTestId("auth-background-card-swap");
    const focusLayer = screen.getByTestId("auth-showcase-focus");

    expect(auroraLayer).toHaveClass("z-0");
    expect(cardLayer).toHaveClass("z-10", "md:block");
    expect(focusLayer).toHaveClass("z-30");
    expect(screen.getByTestId("aurora")).toHaveAttribute(
      "data-color-stops",
      JSON.stringify(["#339cff", "#526477", "#339cff"]),
    );
    expect(screen.getByTestId("aurora")).toHaveAttribute("data-luminance-lift", "1");
    expect(screen.getByTestId("card-swap")).toBeInTheDocument();
    expect(screen.getAllByTestId("card-swap-card")).toHaveLength(3);
    expect(screen.getAllByTestId("auth-browser-frame")).toHaveLength(3);
    expect(screen.getAllByTestId("auth-browser-window-controls")).toHaveLength(3);
    expect(screen.getAllByTestId("auth-browser-tab")).toHaveLength(3);
    expect(screen.getAllByTestId("auth-browser-address")).toHaveLength(3);
    expect(
      auroraLayer.compareDocumentPosition(cardLayer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      cardLayer.compareDocumentPosition(focusLayer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps visible static layers and stops card swapping for reduced motion", () => {
    reducedMotionState.value = true;

    render(<AuthShowcaseBackground />);

    expect(screen.getByTestId("aurora")).toBeInTheDocument();
    expect(screen.getByTestId("auth-card-swap-static")).toBeInTheDocument();
    expect(screen.getByTestId("auth-browser-frame")).toBeInTheDocument();
    expect(screen.queryByTestId("card-swap")).not.toBeInTheDocument();
  });
});
