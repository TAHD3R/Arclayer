import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminFullLogo } from "@/components/layout/admin-logo";
import { usePreferencesStore } from "@/stores/use-preference-store";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("AdminFullLogo", () => {
  beforeEach(() => {
    usePreferencesStore.setState({ themeMode: "light", themePreference: "light" });
  });

  it("switches logo asset when theme mode changes at runtime", () => {
    const view = render(<AdminFullLogo ariaLabel="Arclayer" width={100} />);
    const link = screen.getByRole("link", { name: "Arclayer" });

    expect(link.querySelector("img")).toHaveAttribute("src", "/logo-full.svg");

    act(() => {
      usePreferencesStore.setState({ themeMode: "dark", themePreference: "dark" });
    });
    view.rerender(<AdminFullLogo ariaLabel="Arclayer" width={100} />);

    expect(link.querySelector("img")).toHaveAttribute("src", "/logo-full-dark.svg");
  });
});
