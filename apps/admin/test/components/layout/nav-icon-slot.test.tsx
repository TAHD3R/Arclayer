import { render } from "@testing-library/react";
import { Home } from "lucide-react";
import { describe, expect, it } from "vitest";

import { iconSlot } from "@/components/layout/admin-side-nav/nav-icon-slot";

describe("sidebar nav icon slot", () => {
  it("uses the same semantic foreground as active menu text", () => {
    const { container } = render(iconSlot(0, Home, { isActive: true }));

    expect(container.firstElementChild).toHaveClass("text-label-primary");
    expect(container.firstElementChild).not.toHaveClass("text-primary");
  });
});
