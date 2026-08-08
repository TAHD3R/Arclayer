import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettingDialog } from "@/components/setting-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

describe("SettingDialog", () => {
  it("renders a string description as one Radix slottable element", () => {
    render(
      <SettingDialog
        description="Provider configuration"
        onOpenChange={vi.fn()}
        open
        title="Edit provider"
      >
        <div>Content</div>
      </SettingDialog>,
    );

    expect(screen.getByText("Provider configuration")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("stays open when a select trigger is toggled twice", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onOpenChange = vi.fn();
    render(
      <SettingDialog onOpenChange={onOpenChange} open title="Edit settings">
        <Select>
          <SelectTrigger aria-label="Provider">
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stripe">Stripe</SelectItem>
          </SelectContent>
        </Select>
      </SettingDialog>,
    );

    const trigger = screen.getByRole("combobox", { name: "Provider" });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Edit settings" })).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
