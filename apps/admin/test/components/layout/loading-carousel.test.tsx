import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoadingCarousel } from "@/components/layout/loading-carousel";

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      function MotionDiv(props, ref) {
        return <div ref={ref} {...props} />;
      },
    ),
    button: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
      function MotionButton(props, ref) {
        const {
          whileTap: _whileTap,
          whileHover: _whileHover,
          transition: _transition,
          ...rest
        } = props as React.ButtonHTMLAttributes<HTMLButtonElement> & {
          whileTap?: unknown;
          whileHover?: unknown;
          transition?: unknown;
        };
        return <button ref={ref} {...rest} />;
      },
    ),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const ITEMS = [
  {
    id: "schema",
    title: "Slide One",
    description: "Desc One",
    imageSrc: "/promotion/promotion-001.jpg",
  },
  {
    id: "compose",
    title: "Slide Two",
    description: "Desc Two",
    imageSrc: "/promotion/promotion-002.jpg",
  },
  {
    id: "publish",
    title: "Slide Three",
    description: "Desc Three",
    imageSrc: "/promotion/promotion-003.jpg",
  },
] as const;

describe("LoadingCarousel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-plays through one preview cycle and then stops on the last slide", () => {
    const onSlideChange = vi.fn();
    render(
      <LoadingCarousel
        items={ITEMS}
        reducedMotion={false}
        durationMs={100}
        onSlideChange={onSlideChange}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onSlideChange).toHaveBeenCalledWith(0);
    expect(onSlideChange).toHaveBeenCalledWith(1);
    expect(onSlideChange).toHaveBeenCalledWith(2);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSlideChange.mock.calls.at(-1)?.[0]).toBe(0);
  });

  it("supports manual knot and previous/next controls", () => {
    const onSlideChange = vi.fn();
    render(
      <LoadingCarousel
        items={ITEMS}
        reducedMotion
        durationMs={100}
        onSlideChange={onSlideChange}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "auth:AUTH_BRAND_NEXT" }));
    });
    expect(onSlideChange.mock.calls.at(-1)?.[0]).toBe(1);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "auth:AUTH_BRAND_PREVIOUS" }));
    });
    expect(onSlideChange.mock.calls.at(-1)?.[0]).toBe(0);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "auth:AUTH_BRAND_GOTO_SLIDE 3" }));
    });
    expect(onSlideChange.mock.calls.at(-1)?.[0]).toBe(2);
  });
});
