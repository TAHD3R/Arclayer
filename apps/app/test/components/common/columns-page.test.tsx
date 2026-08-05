import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ColumnsPage } from "@/layouts/page-shell/columns-page";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import type { PropsWithChildren, ReactElement } from "react";

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
  Tooltip: ({ children }: PropsWithChildren) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactElement }) => children,
  TooltipContent: ({ children }: PropsWithChildren) => <>{children}</>,
}));

function mockOverflowingTitle() {
  const keys = {
    clientWidth: 80,
    scrollWidth: 240,
    clientHeight: 24,
    scrollHeight: 24,
  } as const;
  const restores = Object.entries(keys).map(([key, value]) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => value,
    });
    return () => {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, key, original);
        return;
      }
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    };
  });

  return () => restores.forEach((restore) => restore());
}

describe("ColumnsPage", () => {
  beforeEach(() => {
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

  it("renders responsive left and right side slots with bounded width containers", () => {
    render(
      <ColumnsPage
        title="Members"
        sideSlots={{
          left: {
            content: <div>Filters</div>,
            contentClassName: "pr-8 pb-8",
            maxWidth: "20rem",
          },
          right: {
            content: <div>Summary</div>,
            minWidth: 240,
          },
        }}
      >
        <div>Table content</div>
      </ColumnsPage>,
    );

    const shell = document.querySelector('[data-slot="columns-page-shell"]');
    const spacer = document.querySelector('[data-slot="page-shell-top-spacer"]');
    const body = shell?.querySelector('[data-slot="page-main-region"]');
    const content = body?.querySelector('[data-slot="page-content"]');
    const leftSlotWrapper = screen
      .getByText("Filters")
      .closest('[data-slot="columns-page-side-slot"]');
    const rightSlotWrapper = screen
      .getByText("Summary")
      .closest('[data-slot="columns-page-side-slot"]');
    const leftSlot = leftSlotWrapper?.firstElementChild;
    const rightSlot = rightSlotWrapper?.firstElementChild;
    const leftContentWrap = screen.getByText("Filters").parentElement;

    expect(spacer).toHaveAttribute("aria-hidden", "true");
    expect(spacer).toHaveClass(
      "relative",
      "w-full",
      "min-h-[20px]",
      "max-h-[88px]",
      "overflow-hidden",
    );
    expect(spacer?.firstElementChild).toHaveClass(
      "relative",
      "w-full",
      "pb-0",
      "xl:pb-[clamp(20px,calc(5.90277778vw_-_65px),88px)]",
    );
    expect(shell).toHaveClass("hidden", "min-h-0", "min-w-0", "w-full", "lg:flex");
    expect(shell).not.toHaveClass("flex-1");
    expect(body).toHaveClass("flex", "min-h-0", "min-w-0", "w-full", "flex-col");
    expect(body).not.toHaveClass("flex-1");
    expect(body).not.toHaveClass("self-start");
    expect(content).toHaveClass("min-h-0", "min-w-0", "w-full", "flex-1");
    expect(leftSlotWrapper).toHaveAttribute("data-side", "left");
    expect(leftSlotWrapper).toHaveAttribute("data-sticky", "false");
    expect(rightSlotWrapper).toHaveAttribute("data-side", "right");
    expect(rightSlotWrapper).toHaveAttribute("data-sticky", "false");
    expect(leftSlotWrapper).toHaveClass(
      "flex",
      "min-h-0",
      "shrink-0",
      "self-start",
      "[width:var(--columns-page-side-slot-default-width)]",
      "min-w-[var(--columns-page-side-slot-min-width)]",
      "max-w-[var(--columns-page-side-slot-max-width)]",
    );
    expect(rightSlotWrapper).toHaveClass(
      "flex",
      "min-h-0",
      "shrink-0",
      "self-start",
      "[width:var(--columns-page-side-slot-default-width)]",
      "min-w-[var(--columns-page-side-slot-min-width)]",
      "max-w-[var(--columns-page-side-slot-max-width)]",
    );
    expect(leftSlot).toHaveClass("flex", "min-h-0", "w-full", "min-w-0", "self-start");
    expect(leftSlot).not.toHaveClass("sticky");
    expect(rightSlot).toHaveClass("flex", "min-h-0", "w-full", "min-w-0", "self-start");
    expect(rightSlot).not.toHaveClass("sticky");
    expect(leftContentWrap).toHaveClass("min-w-0", "pr-8", "pb-8");
    expect(screen.getAllByText("Table content")).toHaveLength(1);
  });

  it("truncates overflowing page titles and exposes the full title in a tooltip", () => {
    const restore = mockOverflowingTitle();
    const title = "Campaign folder name that should truncate inside the columns header";

    try {
      render(
        <ColumnsPage title={title} showFavoriteToggle={false} sideSlots={{}}>
          <div>Main content</div>
        </ColumnsPage>,
      );

      const titleMatches = screen.getAllByText(title);
      const pageTitle = document.querySelector('[data-slot="page-title"]');

      expect(titleMatches).toHaveLength(2);
      expect(pageTitle).toHaveTextContent(title);
      expect(pageTitle).toHaveClass("truncate", "min-w-0", "max-w-full");
    } finally {
      restore();
    }
  });

  it("enables sticky rail only when requested", () => {
    render(
      <ColumnsPage
        title="Assets"
        sideSlots={{
          right: {
            content: <div>Inspector</div>,
            sticky: true,
            stickyTop: "1.5rem",
          },
        }}
      >
        <div>Main content</div>
      </ColumnsPage>,
    );

    const shell = document.querySelector('[data-slot="columns-page-shell"]');
    const body = shell?.querySelector('[data-slot="page-main-region"]');
    const rightSlotWrapper = screen
      .getByText("Inspector")
      .closest('[data-slot="columns-page-side-slot"]');
    const rightSlot = rightSlotWrapper?.firstElementChild as HTMLElement | null;

    expect(shell).toHaveClass("lg:flex");
    expect(body).not.toHaveClass("self-start");
    expect(rightSlotWrapper).toHaveAttribute("data-sticky", "true");
    expect(rightSlotWrapper).toHaveStyle({
      "--columns-page-side-slot-sticky-top": "1.5rem",
    });
    expect(rightSlotWrapper).toHaveClass("self-stretch");
    expect(rightSlot).toHaveClass(
      "sticky",
      "top-[var(--columns-page-side-slot-sticky-top)]",
      "h-full",
      "max-h-full",
      "overflow-y-auto",
      "overscroll-contain",
      "self-start",
    );
  });

  it("fills the available height when a footer toolbar is present", () => {
    const { container } = render(
      <ColumnsPage
        title="Assets"
        footer={<div>Selection toolbar</div>}
        sideSlots={{
          right: {
            content: <div>Inspector</div>,
            sticky: true,
          },
        }}
      >
        <div>Main content</div>
      </ColumnsPage>,
    );

    const routeRoot = container.firstElementChild;
    const routeInner = container.firstElementChild?.firstElementChild;
    const stack = document.querySelector('[data-slot="columns-page-stack"]');
    const shell = document.querySelector('[data-slot="columns-page-shell"]');
    const body = shell?.querySelector('[data-slot="page-main-region"]');
    const footerWrap = screen.getByText("Selection toolbar").parentElement;

    expect(routeRoot).toHaveClass("h-full", "overflow-hidden", "flex-1");
    expect(routeInner).toHaveClass("pb-0");
    expect(routeInner).toHaveClass("h-full", "min-h-0", "overflow-hidden");
    expect(stack).toHaveClass("flex-1");
    expect(shell).toHaveClass("flex-1");
    expect(body).toHaveClass("flex-1");
    expect(body).not.toHaveClass("self-start");
    expect(footerWrap).toHaveClass("-mx-[var(--admin-route-gutter-x)]");
    expect(screen.getByText("Selection toolbar")).toBeInTheDocument();
  });

  it("hides side slots when ContentGuard renders an error state", () => {
    render(
      <ColumnsPage
        title="Assets"
        sideSlots={{
          right: { content: <div>Auxiliary summary</div> },
        }}
      >
        <ContentGuard loading={false} error={new Error("boom")} />
      </ColumnsPage>,
    );

    expect(screen.queryByText("Auxiliary summary")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="columns-page-shell"]')).toBeNull();
  });

  it("keeps header and side slots when headerVisibility is always", () => {
    render(
      <ColumnsPage
        title="Assets"
        headerVisibility="always"
        extra={<div>Tabs surface</div>}
        sideSlots={{
          right: { content: <div>Auxiliary summary</div> },
        }}
      >
        <ContentGuard loading={false} error={new Error("boom")} />
      </ColumnsPage>,
    );

    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Tabs surface")).toBeInTheDocument();
    expect(screen.getByText("Auxiliary summary")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="columns-page-shell"]')).not.toBeNull();
  });

  it("renders the main region once on mobile when the desktop shell is inactive", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      <ColumnsPage
        title="Assets"
        sideSlots={{
          left: { content: <div>Folders</div> },
        }}
      >
        <div>Main content</div>
      </ColumnsPage>,
    );

    expect(document.querySelector('[data-slot="columns-page-shell"]')).toBeNull();
    expect(screen.getAllByText("Main content")).toHaveLength(1);
  });
});
