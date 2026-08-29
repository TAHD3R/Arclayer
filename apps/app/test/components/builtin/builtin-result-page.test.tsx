import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BuiltinResultPage } from "@/components/builtin/builtin-result-page";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("BuiltinResultPage", () => {
  it("centers the shared in-app empty card on the fullscreen variant", () => {
    const { container } = render(
      <BuiltinResultPage
        variant="fullscreen"
        status="404"
        title="Missing page"
        subTitle="Check the link or return home."
      />,
    );

    const fullscreen = container.firstElementChild;
    expect(fullscreen).toHaveClass(
      "fixed",
      "inset-0",
      "isolate",
      "overflow-y-auto",
      "bg-background",
    );
    expect(container.querySelector("[data-testid='fullscreen-result-aurora']")).toBeNull();
    expect(container.querySelector("[data-slot='empty']")).toHaveClass(
      "border-dashed",
      "rounded-lg",
      "p-6",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Missing page" })).toHaveClass(
      "text-title3",
    );
    expect(screen.getByRole("button", { name: "common:GO_HOME" })).toHaveAttribute(
      "data-size",
      "lg",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("keeps the embedded admin variant on the same in-app presentation", () => {
    render(<BuiltinResultPage status="404" title="Missing page" subTitle="Check the link." />);

    expect(screen.getByRole("button", { name: "common:GO_HOME" })).toHaveAttribute(
      "data-size",
      "lg",
    );
    expect(screen.getByRole("heading", { level: 2, name: "Missing page" })).toHaveClass(
      "text-title3",
    );
  });
});
