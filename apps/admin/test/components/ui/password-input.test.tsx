import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "@arclayer/ui/password-input";

describe("PasswordInput", () => {
  it("does not apply the default h-9 button size to the visibility toggle", () => {
    render(<PasswordInput aria-label="Password" />);

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).not.toHaveClass("h-9");
    expect(toggle).toHaveAttribute("data-size", "icon-xs");
  });
});
