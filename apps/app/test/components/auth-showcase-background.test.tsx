import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthShowcaseBackground } from "@/components/auth-showcase-background";

describe("AuthShowcaseBackground", () => {
  it("renders the static login backdrop without dynamic effects", () => {
    render(<AuthShowcaseBackground />);

    const background = screen.getByTestId("auth-showcase-background");
    const focusLayer = screen.getByTestId("auth-showcase-focus");

    expect(background).toHaveClass("bg-background");
    expect(focusLayer).toHaveClass("z-30");
    expect(screen.queryByTestId("auth-background-aurora")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-background-card-swap")).not.toBeInTheDocument();
  });
});
