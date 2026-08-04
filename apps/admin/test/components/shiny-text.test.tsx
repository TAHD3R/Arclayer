import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ShinyText from "@/components/ShinyText";

const { reducedMotionState } = vi.hoisted(() => ({
  reducedMotionState: { value: false },
}));

vi.mock("@/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => reducedMotionState.value,
}));

describe("ShinyText", () => {
  afterEach(() => {
    reducedMotionState.value = false;
  });

  it("renders readable text with the registry shine treatment", () => {
    render(<ShinyText text="Build visually. Launch confidently." />);

    const text = screen.getByText("Build visually. Launch confidently.");
    expect(text).toHaveClass("auth-shiny-text", "inline-block");
    expect(text).toHaveStyle({ animationName: "arclayer-auth-shiny-text" });
    expect(text.style.getPropertyValue("--auth-shiny-color")).toBe(
      "var(--auth-shiny-default-color)",
    );
    expect(text.style.getPropertyValue("--auth-shiny-highlight")).toBe(
      "var(--auth-shiny-default-highlight)",
    );
  });

  it("honors the Admin reduced-motion preference", () => {
    reducedMotionState.value = true;

    render(<ShinyText text="Build visually. Launch confidently." />);

    expect(screen.getByText("Build visually. Launch confidently.")).toHaveStyle({
      animationName: "none",
    });
  });
});
