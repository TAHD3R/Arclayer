import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ViewModeToggle, type ViewMode } from "@/components/common/view-mode-toggle";

describe("ViewModeToggle", () => {
  test("ships explicit active-state classes for the selected view mode", async () => {
    const user = userEvent.setup();
    let value: ViewMode = "card";
    const handleChange = vi.fn((next: ViewMode) => {
      value = next;
      rerenderToggle();
    });

    const { rerender } = render(
      <ViewModeToggle t={(key) => key} value={value} onChange={handleChange} />,
    );

    const rerenderToggle = () =>
      rerender(<ViewModeToggle t={(key) => key} value={value} onChange={handleChange} />);

    const cardButton = screen.getByRole("radio", { name: "common:VIEW_MODE_CARD" });
    const tableButton = screen.getByRole("radio", { name: "common:VIEW_MODE_TABLE" });

    expect(cardButton.className).toContain("data-[view-mode-state=on]:bg-accent");
    expect(cardButton.className).toContain("data-[view-mode-state=on]:text-accent-foreground");
    expect(cardButton).toHaveAttribute("data-view-mode-state", "on");
    expect(tableButton).toHaveAttribute("data-view-mode-state", "off");

    await user.click(tableButton);

    expect(handleChange).toHaveBeenCalledWith("table");
    expect(screen.getByRole("radio", { name: "common:VIEW_MODE_TABLE" })).toHaveAttribute(
      "data-view-mode-state",
      "on",
    );
  });

  test("shows a tooltip for each view mode button on hover", async () => {
    const user = userEvent.setup();

    render(<ViewModeToggle t={(key) => key} value="card" onChange={vi.fn()} />);

    await user.hover(screen.getByRole("radio", { name: "common:VIEW_MODE_CARD" }));
    expect(await screen.findByText("common:VIEW_MODE_CARD")).toBeInTheDocument();

    await user.unhover(screen.getByRole("radio", { name: "common:VIEW_MODE_CARD" }));
    await user.hover(screen.getByRole("radio", { name: "common:VIEW_MODE_TABLE" }));
    expect(await screen.findByText("common:VIEW_MODE_TABLE")).toBeInTheDocument();
  });
});
