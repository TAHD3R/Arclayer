import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AIComposerRotatingPlaceholder } from "@/components/ai/ai-composer-rotating-placeholder";

const composerState = { text: "" };

vi.mock("@assistant-ui/react", () => ({
  useAuiState: (selector: (state: { composer: { text: string } }) => unknown) =>
    selector({ composer: composerState }),
}));

vi.mock("@/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("AIComposerRotatingPlaceholder", () => {
  beforeEach(() => {
    composerState.text = "";
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("rotates to the next bounded placeholder at a fixed interval", () => {
    const { container } = render(<AIComposerRotatingPlaceholder />);
    const getActive = () => container.querySelector("[data-placeholder-index]");

    expect(getActive()).toHaveAttribute("data-placeholder-index", "0");
    expect(getActive()).toHaveTextContent("AI_CHAT_PLACEHOLDER_CREATE_SITE");

    act(() => vi.advanceTimersByTime(3_200));

    expect(getActive()).toHaveAttribute("data-placeholder-index", "1");
    expect(getActive()).toHaveTextContent("AI_CHAT_PLACEHOLDER_REVIEW_PROJECT");
  });

  it("pauses while the page is hidden and resumes without leaving the placeholder range", () => {
    const { container } = render(<AIComposerRotatingPlaceholder />);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(12_800));

    expect(container.querySelector("[data-placeholder-index]")).toHaveAttribute(
      "data-placeholder-index",
      "0",
    );

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(3_200));

    expect(container.querySelector("[data-placeholder-index]")).toHaveAttribute(
      "data-placeholder-index",
      "1",
    );
  });

  it("uses a two-line clamp for sidebar placeholders", () => {
    const { container } = render(<AIComposerRotatingPlaceholder multiline />);

    expect(container.firstElementChild).toHaveClass("h-12");
    expect(container.querySelector("[data-placeholder-index]")).toHaveClass("line-clamp-2");
  });

  it("becomes visible again after composer text is cleared", () => {
    composerState.text = "draft";
    const view = render(<AIComposerRotatingPlaceholder />);
    const placeholder = view.container.firstElementChild;

    expect(placeholder).toHaveClass("opacity-0");

    composerState.text = "";
    view.rerender(<AIComposerRotatingPlaceholder />);

    expect(placeholder).toHaveClass("opacity-100");
  });
});
