import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
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

  it("uses semantic page title typography and icon-only favorite toggle chrome", () => {
    render(
      <DefaultPage title="Assets">
        <div>Body</div>
      </DefaultPage>,
    );

    const title = screen.getByText("Assets");
    const favoriteButton = screen.getByRole("button", { name: /common:FAVORITE_ADD/ });
    const favoriteIcon = favoriteButton.firstElementChild;
    const favoriteSvg = favoriteButton.querySelector("svg");
    const titleCluster = title.parentElement;
    const shell = document.querySelector('[data-slot="default-page-shell"]');
    const body = shell?.querySelector('[data-slot="page-main-region"]');
    const content = body?.querySelector('[data-slot="page-content"]');

    expect(title).toHaveClass("text-title", "text-label-primary");
    expect(titleCluster).toHaveClass("items-end");
    expect(favoriteButton).toHaveAttribute("data-size", "icon-sm");
    expect(favoriteButton).toHaveClass("size-8", "leading-none", "shrink-0");
    expect(favoriteButton).not.toHaveClass("gap-1.5", "px-3");
    expect(favoriteButton).not.toHaveTextContent("common:FAVORITE_ADD");
    expect(favoriteSvg).toHaveAttribute("width", "16");
    expect(favoriteSvg).toHaveAttribute("height", "16");
    expect(favoriteIcon).toHaveClass("inline-flex", "items-center", "justify-center");
    expect(shell).toHaveClass("flex", "min-h-0", "min-w-0", "w-full");
    expect(shell).not.toHaveClass("flex-1");
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
    expect(document.querySelector('[data-slot="columns-page-shell"]')).toBeNull();
  });

  it("uses an amber favorite accent when the current page is starred", () => {
    useFavoritesStore.setState({ paths: ["/w/ws-1/assets"] });

    render(
      <DefaultPage title="Assets">
        <div>Body</div>
      </DefaultPage>,
    );

    const favoriteButton = screen.getByRole("button", { name: /common:FAVORITE_REMOVE/ });

    expect(favoriteButton).toHaveClass(
      "text-amber-500",
      "hover:text-amber-500",
      "dark:text-amber-300",
      "dark:hover:text-amber-300",
    );
  });

  it("hides the page header when ContentGuard renders an error state", () => {
    render(
      <DefaultPage title="Assets" description="Library overview">
        <ContentGuard loading={false} error={new Error("boom")} />
      </DefaultPage>,
    );

    expect(screen.queryByText("Assets")).not.toBeInTheDocument();
    expect(screen.queryByText("Library overview")).not.toBeInTheDocument();
  });

  it("supports an opt-in centered content container without changing the default shell", () => {
    render(
      <DefaultPage title="Assets" contentContainerClassName="mx-auto max-w-4xl">
        <div>Body</div>
      </DefaultPage>,
    );

    const contentContainer = document.querySelector('[data-slot="page-main-container"]');

    expect(contentContainer).toHaveClass(
      "flex",
      "min-h-0",
      "min-w-0",
      "w-full",
      "flex-1",
      "flex-col",
      "mx-auto",
      "max-w-4xl",
    );
  });
});
