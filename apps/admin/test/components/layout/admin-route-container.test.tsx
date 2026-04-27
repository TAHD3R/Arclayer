import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminRouteContainer } from "@/components/layout/admin-route-container";

describe("AdminRouteContainer", () => {
  it("uses a centered contained frame for shared page-shell routes by default", () => {
    const { container } = render(
      <div className="flex min-h-screen flex-col">
        <AdminRouteContainer overlay={<div>Selection toolbar</div>}>
          <div>Main content</div>
        </AdminRouteContainer>
      </div>,
    );

    expect(screen.getByText("Main content")).toBeInTheDocument();
    expect(screen.getByText("Selection toolbar")).toBeInTheDocument();

    const root = container.firstElementChild?.firstElementChild;
    const inner = root?.firstElementChild;

    expect(root).toHaveClass("flex", "min-h-full");
    expect(root).not.toHaveClass("flex-1");
    expect(root).not.toHaveClass("h-full");
    expect(inner).toHaveClass(
      "flex",
      "min-h-0",
      "min-w-0",
      "w-full",
      "flex-col",
      "mx-auto",
      "max-w-6xl",
      "px-[var(--admin-route-gutter-x)]",
      "pb-20",
    );
    expect(inner).not.toHaveClass("pt-8");
    expect(inner).toHaveAttribute("data-slot", "admin-route-frame");
    expect(inner).not.toHaveClass("flex-1");
    expect(inner).not.toHaveClass("h-full");
    expect(inner).not.toHaveClass("min-h-full");
  });

  it("supports a full-width frame for workbench routes that manage their own canvas", () => {
    const { container } = render(
      <div className="flex min-h-screen flex-col">
        <AdminRouteContainer pageFrame="full" innerClassName="px-0 pt-0 pb-0">
          <div>Main content</div>
        </AdminRouteContainer>
      </div>,
    );

    const root = container.firstElementChild?.firstElementChild;
    const inner = root?.firstElementChild;

    expect(inner).toHaveClass("w-full", "flex-col");
    expect(inner).not.toHaveClass("mx-auto");
    expect(inner).not.toHaveClass("max-w-6xl");
    expect(inner).toHaveClass("px-0", "pt-0", "pb-0");
  });
});
