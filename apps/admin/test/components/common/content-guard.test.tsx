import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { ApiError } from "@/lib/http";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("ContentGuard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the shared Empty icon treatment instead of custom illustrations", () => {
    const { container } = render(
      <ContentGuard
        loading={false}
        error={new ApiError({ status: 403, message: "forbidden" })}
        container="admin-route"
      />,
    );

    expect(container.querySelector("[data-slot='empty-icon']")).toHaveAttribute(
      "data-variant",
      "icon",
    );
    expect(container.querySelector("[data-slot='empty-icon'] svg")).toBeInTheDocument();
  });

  it("supports flush wrapper spacing for full-height page content surfaces", () => {
    const { container } = render(
      <ContentGuard
        loading={false}
        error={new ApiError({ status: 403, message: "forbidden" })}
        wrapperSpacing="flush"
      />,
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("py-0");
    expect(wrapper).not.toHaveClass("py-10");
  });

  it("uses shared Empty typography in compact states", () => {
    const { container } = render(<ContentGuard loading={false} empty variant="compact" />);

    expect(container.querySelector("[data-slot='empty-title']")).toHaveClass("text-title3");
    expect(container.querySelector("[data-slot='empty-title']")).not.toHaveClass("text-largetitle");
    expect(container.querySelector("[data-slot='empty-description']")).toHaveClass("text-body");
    expect(container.querySelector("[data-slot='empty-description']")).not.toHaveClass(
      "text-footnote",
    );
    expect(container.querySelector("[data-slot='empty-icon']")).toHaveClass("mb-2");
  });

  it("offers reporting for server errors but not authorization errors", () => {
    const { rerender } = render(
      <ContentGuard loading={false} error={new ApiError({ status: 403, message: "forbidden" })} />,
    );

    expect(screen.queryByRole("button", { name: "common:REPORT_PROBLEM" })).not.toBeInTheDocument();

    rerender(
      <ContentGuard
        loading={false}
        error={
          new ApiError({
            status: 500,
            message: "server error",
            error: "INTERNAL_ERROR",
            meta: { traceId: "req_456" },
          })
        }
      />,
    );

    expect(screen.getByRole("button", { name: "common:REPORT_PROBLEM" })).toBeVisible();
    const actions = screen
      .getByRole("button", { name: "common:REPORT_PROBLEM" })
      .closest("[data-slot='empty-content']");
    expect(actions).toHaveClass("flex-row", "flex-wrap");
  });
});
