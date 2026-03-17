import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
} from "@arclayer/ui/dropdown-menu";

function renderMenu(props?: { disableHighlight?: boolean }) {
  return render(
    <DropdownMenu open>
      <DropdownMenuContent disableHighlight={props?.disableHighlight}>
        <DropdownMenuIconItem variant="destructive">Delete</DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("DropdownMenu", () => {
  it("keeps destructive items on text-only highlight when parent motion highlight is enabled", () => {
    renderMenu();

    const item = screen.getByRole("menuitem", { name: "Delete" });

    expect(item).toHaveClass("data-[highlighted]:text-destructive");
    expect(item).not.toHaveClass("data-[highlighted]:bg-accent");
  });

  it("falls back to item-level destructive background when content highlight is disabled", () => {
    renderMenu({ disableHighlight: true });

    const item = screen.getByRole("menuitem", { name: "Delete" });

    expect(item).toHaveClass("data-[highlighted]:bg-destructive/10");
    expect(item).toHaveClass("data-[highlighted]:text-destructive");
  });
});
