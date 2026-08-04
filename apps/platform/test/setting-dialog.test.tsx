import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingDialog } from "@/components/setting-dialog";

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
});
