import { render } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const animatePresenceSpy = vi.fn();

vi.mock("motion/react", async () => {
  const React = await import("react");

  const motion = new Proxy(
    {},
    {
      get(_target, property: string) {
        return React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
          function MotionElement({ children, ...props }, ref) {
            return React.createElement(property, { ...props, ref }, children);
          },
        );
      },
    },
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => {
      animatePresenceSpy();
      return <>{children}</>;
    },
    motion,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/projects/ws-1/assets" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactElement }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ColumnsPage } from "@/layouts/page-shell/columns-page";
import { useFavoritesStore } from "@/stores/use-favorites-store";

describe("ColumnsPage animation config", () => {
  beforeEach(() => {
    animatePresenceSpy.mockClear();
    useFavoritesStore.setState({ paths: [] });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(min-width: 1024px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("wraps desktop side panes in AnimatePresence so collapse and expand can animate", () => {
    render(
      <ColumnsPage
        title="Assets"
        sideSlots={{
          right: { content: <div>Inspector</div> },
        }}
      >
        <div>Main content</div>
      </ColumnsPage>,
    );

    expect(animatePresenceSpy).toHaveBeenCalled();
  });
});
