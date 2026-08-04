import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthMetallicLogo } from "@/components/auth-metallic-logo";

describe("AuthMetallicLogo", () => {
  it("uses static theme-specific brand assets at the reference dimensions", () => {
    render(<AuthMetallicLogo />);

    expect(screen.getByTestId("auth-metallic-logo")).toHaveClass("size-12", "md:size-16");
    expect(screen.getByTestId("auth-hero-logo-light")).toHaveAttribute("src", "/logo.svg");
    expect(screen.getByTestId("auth-hero-logo-light")).toHaveClass("dark:hidden");
    expect(screen.getByTestId("auth-hero-logo-dark")).toHaveAttribute("src", "/logo-dark.svg");
    expect(screen.getByTestId("auth-hero-logo-dark")).toHaveClass("hidden", "dark:block");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByTestId("metallic-paint")).not.toBeInTheDocument();
  });
});
