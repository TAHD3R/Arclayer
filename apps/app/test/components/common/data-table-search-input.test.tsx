import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTableSearchInput } from "@/components/common/data-table-search-input";

describe("DataTableSearchInput", () => {
  it("exposes the product search label and clear action to assistive technology", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DataTableSearchInput
        value="latency"
        onChange={onChange}
        placeholder="Search audit events"
        clearLabel="Clear search"
      />,
    );

    const searchInput = screen.getByRole("textbox", { name: "Search audit events" });
    expect(searchInput).toHaveValue("latency");
    expect(searchInput).toHaveAttribute("id");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
