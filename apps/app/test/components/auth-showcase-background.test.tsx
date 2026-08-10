import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthShowcaseBackground } from "@/components/auth-showcase-background";

describe("AuthShowcaseBackground", () => {
  it("renders the configured Drift Wall login backdrop", () => {
    render(<AuthShowcaseBackground />);

    const background = screen.getByTestId("auth-showcase-background");
    const focusLayer = screen.getByTestId("auth-showcase-focus");

    expect(background).toHaveClass("bg-background");
    const driftWall = screen.getByTestId("drift-wall");
    expect(driftWall).toBeInTheDocument();
    expect(driftWall).toHaveStyle({
      "--dw-tile-w": "120px",
      "--dw-tile-h": "90px",
    });
    expect(driftWall.querySelectorAll(".drift-wall__column")).toHaveLength(8);
    const uniqueImages = new Set(
      [...driftWall.querySelectorAll("img")].map((image) => image.getAttribute("src")),
    );
    expect(uniqueImages.size).toBe(16);
    expect(focusLayer).toHaveClass("z-30");
  });
});
