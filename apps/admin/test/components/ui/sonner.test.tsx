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
        toast:
          "rounded-md border border-border/70 bg-popover text-popover-foreground !w-[min(22rem,calc(100vw-2rem))] !items-start !gap-3 !px-4 !py-3 !shadow-none",
        title: "!text-headline !font-semibold !leading-5 !text-label-primary",
        description: "!text-callout !leading-5 !text-label-secondary",
        icon: "mt-0.5 shrink-0 self-start text-current [&_svg]:size-4",
        success: "border-positive/25 [&_[data-icon]]:text-positive",
        error: "border-negative/25 [&_[data-icon]]:text-negative",
        warning: "border-warning/35 [&_[data-icon]]:text-warning",
        info: "border-primary/20 [&_[data-icon]]:text-primary",
        loading: "[&_[data-icon]]:text-primary",
      },
    });
    expect(capturedProps?.style).toMatchObject({
      "--toast-close-button-start": "unset",
      "--toast-close-button-end": "0",
      "--toast-close-button-transform": "translate(35%, -35%)",
      "--toast-icon-margin-start": "0px",
      "--toast-icon-margin-end": "0px",
      "--toast-svg-margin-start": "0px",
      "--toast-svg-margin-end": "0px",
    });
  });
});
