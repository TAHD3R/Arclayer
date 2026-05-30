import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@/components/layout/admin-logo", () => ({
  AdminFullLogo: () => (
    <a href="/login" aria-label="Arclayer">
      Arclayer
    </a>
  ),
}));

vi.mock("@/layouts/auth-preferences-bar", () => ({
  AuthPreferencesBar: () => <div data-testid="auth-preferences-bar">preferences</div>,
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

beforeAll(() => {
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
});

import { AuthLayout } from "@/layouts/auth-layout";

describe("AuthLayout", () => {
  test("positions auth content in a centered column slightly above center", () => {
    const { container } = render(
      <AuthLayout>
        <div>auth-content</div>
      </AuthLayout>,
    );

    expect(screen.getByRole("link", { name: "Arclayer" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-preferences-bar")).toBeInTheDocument();
    expect(screen.getByText("auth-content")).toBeInTheDocument();
    expect(screen.queryByText("auth:FOOTER_COPYRIGHT")).not.toBeInTheDocument();

    const root = container.firstElementChild;
    expect(root).toHaveClass("flex-col");
    expect(root).not.toHaveClass("lg:grid");
    expect(screen.queryByTestId("auth-brand-panel")).not.toBeInTheDocument();

    const header = root?.children.item(0) as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(header).toHaveClass("shrink-0", "justify-center");
    expect(header).not.toHaveClass("absolute", "fixed");

    const scrollContainer = root?.children.item(1) as HTMLElement | null;
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer).toHaveClass("min-h-0", "flex-1");
    expect(scrollContainer).toHaveClass("overflow-y-auto");

    const centeredShell = scrollContainer?.firstElementChild as HTMLElement | null;
    expect(centeredShell).not.toBeNull();
    expect(centeredShell).toHaveClass("items-start");
    expect(centeredShell).toHaveClass("justify-center");
    expect(centeredShell).toHaveClass("pt-[clamp(1.5rem,6vh,4rem)]");
    expect(centeredShell).toHaveClass("pb-[clamp(1.5rem,6vh,4rem)]");
    expect(centeredShell).not.toHaveClass("pb-[clamp(7rem,16vh,9rem)]");

    const footer = root?.children.item(2) as HTMLElement | null;
    expect(footer).not.toBeNull();
    expect(footer).toHaveAttribute("data-testid", "auth-preferences-bar");
    expect(footer).not.toHaveClass("fixed", "absolute");

    expect(root?.children).toHaveLength(3);
  });
});
