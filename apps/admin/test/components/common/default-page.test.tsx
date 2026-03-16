import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
