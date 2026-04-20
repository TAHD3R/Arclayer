import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
  ContentLibraryViewModeToggle,
  type ContentLibraryViewMode,
} from "@/pages/projects/content/library/components/content-library-view-mode-toggle";

describe("ContentLibraryViewModeToggle", () => {
  test("ships explicit active-state classes for the selected view mode", async () => {
    const user = userEvent.setup();
    let value: ContentLibraryViewMode = "card";
    const handleChange = vi.fn((next: ContentLibraryViewMode) => {
      value = next;
      rerenderToggle();
    });

    const { rerender } = render(
      <ContentLibraryViewModeToggle t={(key) => key} value={value} onChange={handleChange} />,
    );

    const rerenderToggle = () =>
      rerender(
        <ContentLibraryViewModeToggle t={(key) => key} value={value} onChange={handleChange} />,
      );

    const cardButton = screen.getByRole("radio", { name: "common:VIEW_MODE_CARD" });
    const tableButton = screen.getByRole("radio", { name: "common:VIEW_MODE_TABLE" });

    expect(cardButton.className).toContain("data-[state=on]:bg-accent");
    expect(cardButton.className).toContain("data-[state=on]:text-accent-foreground");
    expect(cardButton).toHaveAttribute("data-state", "on");
    expect(tableButton).toHaveAttribute("data-state", "off");

    await user.click(tableButton);

    expect(handleChange).toHaveBeenCalledWith("table");
    expect(screen.getByRole("radio", { name: "common:VIEW_MODE_TABLE" })).toHaveAttribute(
      "data-state",
      "on",
    );
  });
});
