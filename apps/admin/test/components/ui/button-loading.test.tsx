import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@arclayer/ui/button";

describe("Button loading", () => {
  it("disables native buttons and replaces children with the spinner", () => {
    render(<Button loading>Register</Button>);

    const button = screen.getByRole("button");

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Register")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});
