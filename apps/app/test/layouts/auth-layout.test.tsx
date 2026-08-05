import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/auth-showcase-background", () => ({
  AuthShowcaseBackground: () => <div data-testid="auth-showcase-background" />,
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({
    children,
    className,
    pendingFallback,
  }: {
    children?: ReactNode;
    className?: string;
    pendingFallback?: ReactNode;
  }) => (
    <div data-testid="route-transition" className={className}>
      {pendingFallback}
      {children}
    </div>
  ),
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
  test("centers auth content without rendering a top header", () => {
    const { container } = render(
      <AuthLayout>
        <div>auth-content</div>
      </AuthLayout>,
    );

    expect(screen.queryByRole("link", { name: "Arclayer" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-wordmark")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-preferences-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-scene-header")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-route-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("auth-scene-background")).toContainElement(
      screen.getByTestId("auth-showcase-background"),
    );
    expect(screen.getByTestId("route-transition")).toHaveClass("w-full");
    expect(screen.getByText("auth-content")).toBeInTheDocument();
    expect(screen.queryByText("auth:FOOTER_COPYRIGHT")).not.toBeInTheDocument();

    const root = container.firstElementChild;
    expect(root).toHaveClass("flex-col", "overflow-y-auto");
    expect(root).not.toHaveClass("overflow-hidden");
    expect(root).not.toHaveClass("lg:grid");
    expect(screen.queryByTestId("auth-brand-panel")).not.toBeInTheDocument();

    const centeredShell = screen.getByTestId("auth-scene-content");
    expect(centeredShell.parentElement).toBe(root);
    expect(centeredShell).toHaveClass("flex-1");
    expect(centeredShell).toHaveClass("z-10");
    expect(centeredShell).not.toHaveClass("overflow-y-auto", "min-h-full");
    expect(centeredShell).toHaveClass("items-center");
    expect(centeredShell).toHaveClass("justify-center");
    expect(centeredShell).toHaveClass("px-6", "py-6", "md:px-4", "md:py-4", "max-md:-mt-[20px]");
    expect(screen.getByTestId("route-transition").parentElement).toHaveClass("max-w-[25.875rem]");
    expect(screen.getByTestId("auth-scene-background")).toHaveClass("z-0");

    expect(root?.children).toHaveLength(2);
  });
});
