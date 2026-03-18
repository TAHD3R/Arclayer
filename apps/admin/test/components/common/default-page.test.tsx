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
    render(
      <DefaultPage title="Assets">
        <div>Body</div>
      </DefaultPage>,
    );

    const title = screen.getByText("Assets");
    const favoriteButton = screen.getByRole("button", { name: /common:FAVORITE_ADD/ });
    const titleCluster = title.parentElement;
    const shell = document.querySelector('[data-slot="default-page-shell"]');
    const body = shell?.querySelector('[data-slot="page-main-region"]');
    const content = body?.querySelector('[data-slot="page-content"]');

    expect(title).toHaveClass("text-title", "text-label-primary");
    expect(titleCluster).toHaveClass("items-end");
    expect(favoriteButton).toHaveAttribute("data-size", "sm");
    expect(favoriteButton).toHaveClass("h-8", "leading-none");
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
