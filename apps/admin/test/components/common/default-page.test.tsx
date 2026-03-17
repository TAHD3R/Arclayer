import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
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

describe("DefaultPage", () => {
  beforeEach(() => {
    useFavoritesStore.setState({ paths: [] });
  });

  it("uses semantic page title typography and compact favorite toggle chrome", () => {
    render(<DefaultPage title="Assets" />);

    const title = screen.getByText("Assets");
    const favoriteButton = screen.getByRole("button", { name: /common:FAVORITE_ADD/ });
    const titleCluster = title.parentElement;

    expect(title).toHaveClass("text-title", "text-label-primary");
    expect(titleCluster).toHaveClass("items-end");
    expect(favoriteButton).toHaveAttribute("data-size", "sm");
    expect(favoriteButton).toHaveClass("h-8", "leading-none");
  });

  it("renders responsive left and right side slots with bounded width containers", () => {
    render(
      <DefaultPage
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
      </DefaultPage>,
    );

    const shell = document.querySelector('[data-slot="default-page-shell"]');
    const body = shell?.querySelector('[data-slot="default-page-main-region"]');
    const leftSlotWrapper = screen
      .getByText("Filters")
      .closest('[data-slot="default-page-side-slot"]');
    const rightSlotWrapper = screen
      .getByText("Summary")
      .closest('[data-slot="default-page-side-slot"]');
    const leftSlot = leftSlotWrapper?.firstElementChild;
    const rightSlot = rightSlotWrapper?.firstElementChild;

    expect(shell).toHaveClass("hidden", "min-h-0", "min-w-0", "w-full", "flex-1", "lg:flex");
    expect(body).toHaveClass(
      "flex",
      "h-full",
      "min-h-0",
      "min-w-0",
      "w-full",
      "flex-1",
      "flex-col",
    );
    expect(leftSlotWrapper).toHaveAttribute("data-side", "left");
    expect(rightSlotWrapper).toHaveAttribute("data-side", "right");
    expect(leftSlotWrapper).toHaveClass(
      "flex",
      "h-full",
      "min-h-0",
      "shrink-0",
      "[width:var(--default-page-side-slot-default-width)]",
      "min-w-[var(--default-page-side-slot-min-width)]",
      "max-w-[var(--default-page-side-slot-max-width)]",
    );
    expect(rightSlotWrapper).toHaveClass(
      "flex",
      "h-full",
      "min-h-0",
      "shrink-0",
      "[width:var(--default-page-side-slot-default-width)]",
      "min-w-[var(--default-page-side-slot-min-width)]",
      "max-w-[var(--default-page-side-slot-max-width)]",
    );
    expect(leftSlot).toHaveClass("flex", "h-full", "min-h-0", "w-full", "min-w-0");
    expect(rightSlot).toHaveClass("flex", "h-full", "min-h-0", "w-full", "min-w-0");
  });

  it("hides side slots when ContentGuard renders an error state", () => {
    render(
      <DefaultPage
        title="Assets"
        sideSlots={{
          right: { content: <div>Auxiliary summary</div> },
        }}
      >
        <ContentGuard loading={false} error={new Error("boom")} />
      </DefaultPage>,
    );

    expect(screen.queryByText("Auxiliary summary")).not.toBeInTheDocument();
  });
});
