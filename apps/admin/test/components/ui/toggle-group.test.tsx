import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";

describe("ToggleGroup", () => {
  test("applies shared selected-state styling to outline items", () => {
    render(
      <ToggleGroup type="single" variant="outline" value="card" aria-label="View mode">
        <ToggleGroupItem value="card" aria-label="Card">
          Card
        </ToggleGroupItem>
        <ToggleGroupItem value="table" aria-label="Table">
          Table
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    const cardButton = screen.getByRole("radio", { name: "Card" });
    const tableButton = screen.getByRole("radio", { name: "Table" });

    expect(cardButton.className).toContain("data-[state=on]:border-border/80");
    expect(cardButton.className).toContain("data-[state=on]:bg-accent");
    expect(cardButton.className).toContain("data-[state=on]:text-accent-foreground");
    expect(cardButton).toHaveAttribute("data-state", "on");
    expect(tableButton).toHaveAttribute("data-state", "off");
  });
});
