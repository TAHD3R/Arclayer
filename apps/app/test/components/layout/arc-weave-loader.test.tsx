import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArcWeaveLoader } from "@/components/layout/arc-weave-loader";

const { reducedMotionState } = vi.hoisted(() => ({
  reducedMotionState: { value: false },
}));

vi.mock("@/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => reducedMotionState.value,
}));

describe("ArcWeaveLoader", () => {
  let animationCallback: FrameRequestCallback | undefined;

  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationCallback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    reducedMotionState.value = false;
    vi.restoreAllMocks();
  });

  it("renders a 64-particle Arc Weave trail driven by animation frames", () => {
    const { container } = render(<ArcWeaveLoader />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-arc-weave-particle]")).toHaveLength(64);
    expect(container.querySelector("animateMotion")).not.toBeInTheDocument();
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();

    const path = container.querySelector("[data-arc-weave-path]");
    const initialPath = path?.getAttribute("d");
    animationCallback?.(performance.now() + 2_100);

    expect(path?.getAttribute("d")).not.toBe(initialPath);
    expect(container.querySelector("g")?.getAttribute("transform")).not.toBe("rotate(0 50 50)");
  });

  it("keeps the static Arc Weave trace when reduced motion is preferred", () => {
    reducedMotionState.value = true;
    const { container } = render(<ArcWeaveLoader />);

    expect(container.querySelector("[data-arc-weave-path]")).toBeInTheDocument();
    expect(container.querySelector("[data-arc-weave-particle]")).not.toBeInTheDocument();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("supports a custom label and presentation class", () => {
    render(<ArcWeaveLoader label="正在加载场景" className="size-20" />);

    expect(screen.getByRole("status", { name: "正在加载场景" })).toHaveClass("size-20");
  });
});
