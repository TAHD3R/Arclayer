import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GlobalLayout } from "@/layouts/global-layout";

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
}));

vi.mock("@/layouts/admin-scene-layout", () => ({
  AdminSceneLayout: ({
    children,
    sidebarCollapsible,
  }: {
    children: React.ReactNode;
    sidebarCollapsible?: "icon" | "none";
  }) => (
    <div data-testid="admin-scene-layout" data-sidebar-collapsible={sidebarCollapsible}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/layout/admin-topbar", () => ({
  AdminTopbar: () => <div data-testid="admin-topbar" />,
}));

describe("GlobalLayout", () => {
  it("keeps the global shell sidebar collapsible so desktop rail can drive collapse", () => {
    render(<GlobalLayout />);

    expect(screen.getByTestId("admin-scene-layout")).toHaveAttribute(
      "data-sidebar-collapsible",
      "icon",
    );
  });
});
