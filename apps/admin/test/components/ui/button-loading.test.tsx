import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@arclayer/ui/button";

describe("Button loading", () => {
  it("disables native buttons and shows a centered spinner while preserving label width", () => {
    render(<Button loading>Register</Button>);

    const button = screen.getByRole("button");
    const label = screen.getByText("Register");

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(label).toHaveClass("invisible");
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});
