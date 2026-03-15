import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@/components/layout/admin-toggle-locales", () => ({
  AdminLocaleToggle: () => <button type="button">locale</button>,
}));

vi.mock("@/components/layout/admin-toggle-theme", () => ({
  AdminThemeModeToggle: () => <button type="button">theme</button>,
}));

vi.mock("@/components/layout/auth-brand-panel", () => ({
  AuthBrandPanel: () => <div data-testid="auth-brand-panel">brand</div>,
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
  test("keeps mobile auth content scrollable under the controls bar", () => {
    const { container } = render(
      <AuthLayout>
        <div>auth-content</div>
      </AuthLayout>,
    );

    expect(screen.getByText("locale")).toBeInTheDocument();
    expect(screen.getByText("theme")).toBeInTheDocument();
    expect(screen.getByText("auth-content")).toBeInTheDocument();

    const root = container.firstElementChild;
    expect(root).toHaveClass("flex-col");

    const contentColumn = root?.lastElementChild as HTMLElement | null;
    expect(contentColumn).not.toBeNull();
    expect(contentColumn).toHaveClass("flex-1");
    expect(contentColumn).toHaveClass("overflow-y-auto");
  });
});
