import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BuiltinResultPage } from "@/components/builtin/builtin-result-page";

vi.mock("@/components/Aurora", () => ({
  default: () => <div data-testid="aurora-canvas" />,
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("BuiltinResultPage", () => {
  it("keeps one deterministic fullscreen recovery action at the large size", () => {
    render(
      <BuiltinResultPage
        variant="fullscreen"
        status="404"
        title="Missing page"
        subTitle="Check the link or return home."
      />,
    );

    const homeAction = screen.getByRole("button", { name: "common:GO_HOME" });
    expect(homeAction).toHaveAttribute("data-size", "lg");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("does not apply fullscreen presentation to the embedded Admin variant", () => {
    const { container } = render(
      <BuiltinResultPage status="404" title="Missing page" subTitle="Check the link." />,
    );

    expect(screen.getByRole("button", { name: "common:GO_HOME" })).toHaveAttribute(
      "data-size",
      "default",
    );
    expect(screen.getByRole("heading", { level: 2, name: "Missing page" })).toHaveClass(
      "text-title3",
    );
    expect(container.querySelector("[data-testid='fullscreen-result-aurora']")).toBeNull();
  });
});
