import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminRouteContainer } from "@/components/layout/admin-route-container";

describe("AdminRouteContainer", () => {
  it("stretches to the route region so bottom overlays anchor to the viewport bottom", () => {
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

    expect(root).toHaveClass("flex", "flex-1", "min-h-full");
    expect(inner).toHaveClass("flex", "flex-1", "min-h-0");
    expect(inner).not.toHaveClass("min-h-full");
  });
});
