import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuIconItem,
} from "@arclayer/ui/dropdown-menu";

function renderMenu() {
  return render(
    <DropdownMenu open>
      <DropdownMenuContent>
        <DropdownMenuIconItem variant="destructive">Delete</DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("DropdownMenu", () => {
  it("keeps checkbox item selection behavior after removing motion highlight", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked={false} onCheckedChange={onCheckedChange}>
            Image
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Image" }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(document.querySelector('[data-slot="motion-highlight"]')).not.toBeInTheDocument();
  });

  it("uses select-like surface and item spacing", () => {
    renderMenu();

    const content = document.querySelector('[data-slot="dropdown-menu-content"]');
    const item = screen.getByRole("menuitem", { name: "Delete" });

    expect(content).toHaveClass("rounded-md", "p-1");
    expect(content).not.toHaveClass("rounded-xl", "p-2");
    expect(content).toHaveClass(
      "data-[state=open]:animate-in",
      "data-[state=closed]:animate-out",
      "data-[state=open]:fade-in-0",
      "data-[state=closed]:fade-out-0",
      "data-[state=open]:zoom-in-95",
      "data-[state=closed]:zoom-out-95",
      "data-[side=bottom]:slide-in-from-top-2",
    );
    expect(item).toHaveClass("px-2", "py-1.5", "text-footnote");
    expect(item).not.toHaveClass("text-callout");
    expect(document.querySelector('[data-slot="motion-highlight"]')).not.toBeInTheDocument();
    expect(item).toHaveClass("data-[highlighted]:bg-destructive/10");
    expect(item).toHaveClass("data-[highlighted]:text-destructive");
  });
});
