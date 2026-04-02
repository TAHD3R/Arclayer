import { FilmIcon } from "lucide-react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Toolbar, ToolbarButton } from "../../../../../packages/ui/shadcn/src/editor/ui/toolbar";

describe("ToolbarButton", () => {
  it("keeps icon-only dropdown indicators inside the trigger layout", () => {
    render(
      <Toolbar>
        <ToolbarButton isDropdown dropdownMode="icon" aria-label="Video">
          <FilmIcon />
        </ToolbarButton>
      </Toolbar>,
    );

    const button = screen.getByRole("button", { name: "Video" });
    const content = button.querySelector("[data-toolbar-dropdown-content='icon']");
    const indicator = button.querySelector("[data-toolbar-dropdown-indicator]");

    expect(button.className).toContain("w-auto");
    expect(button.className).toContain("px-2");
    expect(content).toBeTruthy();
    expect(indicator).toBeTruthy();
  });

  it("keeps text dropdown indicators aligned within the same trigger", () => {
    render(
      <Toolbar>
        <ToolbarButton isDropdown aria-label="Turn into">
          Text
        </ToolbarButton>
      </Toolbar>,
    );

    const button = screen.getByRole("button", { name: "Turn into" });
    const content = button.querySelector("[data-toolbar-dropdown-content='text']");
    const indicator = button.querySelector("[data-toolbar-dropdown-indicator]");

    expect(button.className).toContain("justify-between");
    expect(button.className).toContain("pr-2");
    expect(content).toBeTruthy();
    expect(indicator).toBeTruthy();
  });
});
