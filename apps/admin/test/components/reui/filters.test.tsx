import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Filters, createFilter, type FilterFieldConfig } from "@/components/reui/filters";

type FilterValue = string;

const FIELDS: FilterFieldConfig<FilterValue>[] = [
  {
    key: "mimePrefix",
    label: "Type",
    type: "select",
    searchable: false,
    options: [
      { value: "image/", label: "Image" },
      { value: "video/", label: "Video" },
    ],
  },
];

describe("Filters", () => {
  it("uses shared dropdown without motion highlight and still applies submenu selections", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Filters
        filters={[]}
        fields={FIELDS}
        onChange={onChange}
        trigger={<button type="button">Filter</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByText("Type"));
    const submenuListbox = (await screen.findAllByRole("listbox")).at(-1);

    expect(submenuListbox).toBeTruthy();
    submenuListbox?.focus();
    await user.keyboard("{Enter}");

    expect(document.querySelector('[data-slot="motion-highlight"]')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        field: "mimePrefix",
        operator: "is",
        values: ["image/"],
      }),
    ]);
  });

  it("still marks the selected option when reopening a value selector", async () => {
    const user = userEvent.setup();

    render(
      <Filters
        filters={[createFilter("mimePrefix", "is", ["image/"])]}
        fields={FIELDS}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Image" }));

    const selectedOption = screen
      .getAllByText("Image")
      .map((node) => node.closest('[role="option"]'))
      .find(Boolean);

    expect(selectedOption).toHaveAttribute("data-highlighted", "true");
    expect(document.querySelector('[data-slot="motion-highlight"]')).not.toBeInTheDocument();
  });
});
