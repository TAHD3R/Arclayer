import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

let capturedProps: Record<string, unknown> | null = null;

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("sonner", () => ({
  Toaster: ({ children: _children, ...props }: { children?: ReactNode }) => {
    capturedProps = props;
    return <div data-testid="sonner-root" />;
  },
}));

describe("shared Toaster", () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it("defaults to a top-right placement and shared typography classes", async () => {
    const { Toaster } = await import("@arclayer/ui/sonner");

    render(<Toaster richColors closeButton />);

    expect(capturedProps?.position).toBe("top-right");
    expect(capturedProps?.toastOptions).toMatchObject({
      classNames: {
        title: "!text-headline !text-current",
        description: "!text-callout text-label-secondary",
        success: "border-positive/25 text-positive",
        error: "border-negative/25 text-negative",
        warning: "border-warning/35 text-warning",
        info: "border-primary/20 text-primary",
      },
    });
    expect(capturedProps?.style).toMatchObject({
      "--toast-close-button-start": "unset",
      "--toast-close-button-end": "0",
      "--toast-close-button-transform": "translate(35%, -35%)",
    });
  });
});
