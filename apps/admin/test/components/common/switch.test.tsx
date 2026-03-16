import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Switch } from "@arclayer/ui/switch";

describe("Switch", () => {
  it("renders knot decoration and animation hooks", () => {
    const { container } = render(<Switch aria-label="Notifications" />);

    const root = container.querySelector('[data-slot="switch"]');
    const knot = container.querySelector('[data-slot="switch-knot"]');

    expect(root).toBeTruthy();
    expect(knot).toBeTruthy();

    expect(root).toHaveClass("group/switch", "overflow-hidden", "justify-start");
    expect(knot).toHaveClass("group-data-[state=checked]/switch:translate-x-3");
    expect(container.querySelector('[data-slot="switch-thumb"]')).toHaveClass(
      "data-[state=checked]:translate-x-3",
    );
  });
});
