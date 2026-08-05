import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { Button } from "@arclayer/ui/button";
import type { PropsWithChildren, ReactElement } from "react";

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string; searchStr: string } }) => unknown;
  }) => select({ location: { pathname: "/projects/ws-1/assets", searchStr: "" } }),
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
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
    const spacer = document.querySelector('[data-slot="page-shell-top-spacer"]');
    const shell = document.querySelector('[data-slot="default-page-shell"]');
    const body = shell?.querySelector('[data-slot="page-main-region"]');
    const content = body?.querySelector('[data-slot="page-content"]');
    const routeFrame = document.querySelector('[data-slot="admin-route-frame"]');

    expect(title).toHaveClass("text-title", "text-label-primary");
    expect(titleCluster).toHaveClass("items-end");
    expect(favoriteButton).toHaveAttribute("data-size", "icon-sm");
    expect(favoriteButton).toHaveClass("size-8", "shrink-0");
    expect(favoriteButton).not.toHaveClass("gap-1.5", "px-3");
    expect(favoriteButton).not.toHaveTextContent("common:FAVORITE_ADD");
    expect(favoriteSvg).toHaveAttribute("width", "16");
    expect(favoriteSvg).toHaveAttribute("height", "16");
    expect(favoriteIcon).toHaveClass("inline-flex", "items-center", "justify-center");
    expect(spacer).toHaveAttribute("aria-hidden", "true");
    expect(spacer).toHaveAttribute("data-preset", "page");
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
    expect(shell).toHaveClass("flex", "min-h-0", "min-w-0", "w-full");
    expect(shell).not.toHaveClass("flex-1");
    expect(body).toHaveClass("flex", "min-h-0", "min-w-0", "w-full", "flex-1", "flex-col");
    expect(content).toHaveClass("min-h-0", "min-w-0", "w-full", "flex-1");
    expect(routeFrame).toHaveClass("pb-20");
    expect(document.querySelector('[data-slot="columns-page-shell"]')).toBeNull();
  });

  it("normalizes primary and secondary text buttons in the page action slot", () => {
    render(
      <DefaultPage
        title="Content"
        action={
          <>
            <Button variant="outline" size="sm">
              Secondary
            </Button>
            <Button size="lg">Primary</Button>
          </>
        }
      >
        <div>Body</div>
      </DefaultPage>,
    );

    const actions = document.querySelector('[data-slot="page-header-actions"]');

    expect(actions).toHaveClass(
      "[&_[data-slot=button][data-size=default]]:h-10",
      "[&_[data-slot=button][data-size=sm]]:h-10",
    );
    expect(screen.getByRole("button", { name: "Secondary" })).toHaveAttribute("data-size", "sm");
    expect(screen.getByRole("button", { name: "Primary" })).toHaveAttribute("data-size", "lg");
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
    useFavoritesStore.setState({ paths: ["/projects/ws-1/assets"] });

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

  it("renders after-favorite actions next to the page title favorite toggle", () => {
    render(
      <DefaultPage title="Article" afterFavorite={<button type="button">Copy ID</button>}>
        <div>Body</div>
      </DefaultPage>,
    );

    const title = screen.getByText("Article");
    const titleCluster = title.parentElement;
    const favoriteButton = screen.getByRole("button", { name: /common:FAVORITE_ADD/ });
    const copyButton = screen.getByRole("button", { name: "Copy ID" });

    expect(titleCluster).toContainElement(favoriteButton);
    expect(titleCluster).toContainElement(copyButton);
  });

  it("uses an explicit favorite path when the route needs search params", () => {
    render(
      <DefaultPage
        title="Article"
        favoritePath="/projects/project-1/content/models/edit?modelId=model-1"
      >
        <div>Body</div>
      </DefaultPage>,
    );

    fireEvent.click(screen.getByRole("button", { name: /common:FAVORITE_ADD/ }));

    expect(useFavoritesStore.getState().paths).toContain(
      "/projects/project-1/content/models/edit?modelId=model-1",
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

  it("keeps sticky headers anchored to the route scroll container without stretching page content", () => {
    render(
      <DefaultPage
        title="System settings"
        description="Manage instance settings"
        headerBehavior="sticky"
        headerClassName="lg:pt-6"
        contentContainerClassName="[--page-sticky-header-height:6rem]"
      >
        <div>Body</div>
      </DefaultPage>,
    );

    const mainRegion = document.querySelector('[data-slot="page-main-region"]');
    const contentContainer = document.querySelector('[data-slot="page-main-container"]');
    const header = document.querySelector('[data-slot="page-main-header"]');
    const routeFrame = document.querySelector('[data-slot="admin-route-frame"]');

    expect(routeFrame).toHaveClass("shrink-0");
    expect(mainRegion).toHaveClass("flex", "min-h-0", "min-w-0", "w-full", "flex-col");
    expect(mainRegion).not.toHaveClass("flex-1");
    expect(contentContainer).toHaveClass("flex", "min-h-0", "min-w-0", "w-full", "flex-col");
    expect(contentContainer).not.toHaveClass("flex-1");
    expect(header).toHaveClass(
      "sticky",
      "top-0",
      "z-20",
      "-mx-[var(--admin-route-gutter-x)]",
      "min-h-24",
      "bg-background/95",
      "px-[var(--admin-route-gutter-x)]",
      "py-2",
      "lg:pt-6",
    );
  });

  it("exposes the measured sticky header height for related sticky offsets", () => {
    const heightSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 132 } as DOMRect);

    render(
      <DefaultPage
        title="System settings"
        description="A longer description can wrap and make the sticky header taller."
        headerBehavior="sticky"
        contentContainerClassName="[--page-sticky-header-height:6rem]"
      >
        <div>Body</div>
      </DefaultPage>,
    );

    const contentContainer = document.querySelector(
      '[data-slot="page-main-container"]',
    ) as HTMLElement | null;

    expect(contentContainer).toHaveStyle({ "--page-sticky-header-height": "132px" });

    heightSpy.mockRestore();
  });

  it("uses compact horizontal spacing without a scrolling top spacer in settings dialogs", () => {
    render(
      <DefaultPage title="Settings" spacingPreset="settings-dialog">
        <div>Body</div>
      </DefaultPage>,
    );

    const routeFrame = document.querySelector('[data-slot="admin-route-frame"]');
    const spacer = document.querySelector('[data-slot="page-shell-top-spacer"]');

    expect(routeFrame).toHaveClass(
      "[--admin-route-gutter-x:1rem]",
      "sm:[--admin-route-gutter-x:1.5rem]",
      "lg:[--admin-route-gutter-x:2.5rem]",
    );
    expect(routeFrame).not.toHaveClass(
      "lg:[--admin-route-gutter-x:clamp(2.5rem,calc(15.85365854vw_-_122.439024px),9rem)]",
    );
    expect(spacer).toBeNull();
  });
});
