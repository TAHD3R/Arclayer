import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@/components/layout/admin-toggle-locales", () => ({
  AdminLocaleToggle: () => <button type="button">locale</button>,
}));

vi.mock("@/components/layout/admin-toggle-theme", () => ({
  AdminThemeModeToggle: () => <button type="button">theme</button>,
}));

vi.mock("@/components/layout/route-transition", () => ({
  RouteTransition: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/layout/legal-footer", () => ({
  LegalFooterCopyright: () => <div>auth:FOOTER_COPYRIGHT</div>,
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
  test("centers auth content in a single column under the controls bar", () => {
    const { container } = render(
      <AuthLayout>
        <div>auth-content</div>
      </AuthLayout>,
    );

    expect(screen.getByText("locale")).toBeInTheDocument();
    expect(screen.getByText("theme")).toBeInTheDocument();
    expect(screen.getByText("auth-content")).toBeInTheDocument();
    expect(screen.getByText("auth:FOOTER_COPYRIGHT")).toBeInTheDocument();

    const root = container.firstElementChild;
    expect(root).toHaveClass("flex-col");
    expect(root).not.toHaveClass("lg:grid");
    expect(screen.queryByTestId("auth-brand-panel")).not.toBeInTheDocument();

    const scrollContainer = root?.children.item(1) as HTMLElement | null;
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer).toHaveClass("flex-1");
    expect(scrollContainer).toHaveClass("overflow-y-auto");

    const centeredShell = scrollContainer?.firstElementChild as HTMLElement | null;
    expect(centeredShell).not.toBeNull();
    expect(centeredShell).toHaveClass("items-center");
    expect(centeredShell).toHaveClass("justify-center");

    const footer = root?.lastElementChild as HTMLElement | null;
    expect(footer).not.toBeNull();
    expect(footer).toHaveClass("shrink-0");
    expect(footer).toHaveTextContent("auth:FOOTER_COPYRIGHT");
  });
});
