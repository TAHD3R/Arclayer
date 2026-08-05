import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AIComposerTriggerScrollArea } from "@/components/ai/ai-composer-trigger-scroll-area";

const triggerScope = vi.hoisted(() => ({
  highlightedItemId: "trigger-option-2" as string | undefined,
  open: true,
}));

vi.mock("@assistant-ui/react", () => ({
  unstable_useTriggerPopoverScopeContext: () => triggerScope,
}));

function rect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function renderScrollArea(children: ReactNode) {
  return render(<AIComposerTriggerScrollArea>{children}</AIComposerTriggerScrollArea>);
}

describe("AIComposerTriggerScrollArea", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the keyboard-highlighted item visible without widening long rows", () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    rectSpy.mockImplementation(function (this: HTMLElement) {
      if (this.dataset.slot === "composer-trigger-scroll-region") return rect(0, 100);
      if (this.id === "trigger-option-2") return rect(120, 140);
      return rect(0, 0);
    });

    const { container } = renderScrollArea(
      <button id="trigger-option-2" type="button">
        A very long trigger option label
      </button>,
    );

    const scrollRegion = container.querySelector<HTMLElement>(
      '[data-slot="composer-trigger-scroll-region"]',
    );

    expect(scrollRegion).toHaveClass(
      "min-h-0",
      "min-w-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(container.querySelector('[data-slot="scroll-area"]')).not.toBeInTheDocument();
    expect(scrollRegion).toHaveProperty("scrollTop", 40);
  });
});
