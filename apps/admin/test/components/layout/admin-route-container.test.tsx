import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminRouteContainer } from "@/components/layout/admin-route-container";

describe("AdminRouteContainer", () => {
  it("keeps route pages content-sized by default", () => {
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
    expect(inner).toHaveClass("flex", "min-h-0");
    expect(inner).not.toHaveClass("flex-1");
    expect(inner).not.toHaveClass("h-full");
    expect(inner).not.toHaveClass("min-h-full");
  });
});
