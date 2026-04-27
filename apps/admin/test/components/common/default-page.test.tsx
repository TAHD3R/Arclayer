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
    expect(favoriteButton).toHaveClass("size-8", "shrink-0");
    expect(favoriteButton).not.toHaveClass("gap-1.5", "px-3");
    expect(favoriteButton).not.toHaveTextContent("common:FAVORITE_ADD");
    expect(favoriteSvg).toHaveAttribute("width", "16");
    expect(favoriteSvg).toHaveAttribute("height", "16");
    expect(favoriteIcon).toHaveClass("inline-flex", "items-center", "justify-center");
    expect(shell).toHaveClass("flex", "min-h-0", "min-w-0", "w-full");
    expect(shell).not.toHaveClass("flex-1");
    expect(body).toHaveClass("flex", "min-h-0", "min-w-0", "w-full", "flex-1", "flex-col");
    expect(content).toHaveClass("min-h-0", "min-w-0", "w-full", "flex-1");
    expect(document.querySelector('[data-slot="columns-page-shell"]')).toBeNull();
  });

  it("truncates overflowing page titles and exposes the full title in a tooltip", () => {
    const restore = mockOverflowingTitle();
    const title = "Campaign folder name that should truncate inside the page header";

    try {
      render(
        <DefaultPage title={title} showFavoriteToggle={false}>
          <div>Body</div>
        </DefaultPage>,
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

  it("keeps the page header and extra surface when headerVisibility is always", () => {
    render(
      <DefaultPage
        title="Assets"
        description="Library overview"
        headerVisibility="always"
        extra={<div>Tabs surface</div>}
      >
        <ContentGuard loading={false} error={new Error("boom")} />
      </DefaultPage>,
    );

    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Library overview")).toBeInTheDocument();
    expect(screen.getByText("Tabs surface")).toBeInTheDocument();
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
