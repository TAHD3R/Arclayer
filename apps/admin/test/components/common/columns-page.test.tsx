import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ColumnsPage } from "@/components/common/columns-page";
import { ContentGuard } from "@/components/common/content-guard";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import type { PropsWithChildren, ReactElement } from "react";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/w/ws-1/assets" } }),
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

describe("ColumnsPage", () => {
  beforeEach(() => {
    useFavoritesStore.setState({ paths: [] });
  });

  it("renders responsive left and right side slots with bounded width containers", () => {
    render(
      <ColumnsPage
        title="Members"
        sideSlots={{
          left: {
            content: <div>Filters</div>,
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

    expect(shell).toHaveClass("hidden", "min-h-0", "min-w-0", "w-full", "flex-1", "lg:flex");
    expect(body).toHaveClass(
      "flex",
      "min-h-0",
      "min-w-0",
      "w-full",
      "flex-1",
      "flex-col",
      "self-start",
    );
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
    expect(body).toHaveClass("self-start");
    expect(rightSlotWrapper).toHaveAttribute("data-sticky", "true");
    expect(rightSlotWrapper).toHaveStyle({
      "--columns-page-side-slot-sticky-top": "1.5rem",
    });
    expect(rightSlot).toHaveClass(
      "sticky",
      "top-[var(--columns-page-side-slot-sticky-top)]",
      "max-h-[calc(100vh-var(--columns-page-side-slot-sticky-top))]",
      "self-start",
    );
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
});
