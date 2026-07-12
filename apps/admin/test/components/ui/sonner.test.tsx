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

    render(
      <Toaster
        richColors
        containerAriaLabel="Notifications"
        toastOptions={{ closeButtonAriaLabel: "Close" }}
      />,
    );

    expect(capturedProps?.position).toBe("top-right");
    expect(capturedProps?.expand).toBe(false);
    expect(capturedProps?.visibleToasts).toBe(3);
    expect(capturedProps?.closeButton).toBe(true);
    expect(capturedProps?.containerAriaLabel).toBe("Notifications");
    expect(capturedProps?.className).toBe("toaster group ");
    expect(capturedProps?.toastOptions).toMatchObject({
      closeButtonAriaLabel: "Close",
      classNames: {
        toast:
          "rounded-md border border-border/70 bg-popover text-popover-foreground !items-start !gap-3 !px-4 !py-3 !shadow-none [&_[data-content]]:pr-7",
        title: "!text-headline !font-semibold !text-label-primary",
        description: "!text-callout !text-label-secondary",
        icon: "mt-0.5 shrink-0 self-start text-current [&_svg]:size-4",
        closeButton: expect.stringContaining("size-6"),
        success: "border-positive/25 [&_[data-icon]]:text-positive",
        error: "border-negative/25 [&_[data-icon]]:text-negative",
        warning: "border-warning/35 [&_[data-icon]]:text-warning",
        info: "border-primary/20 [&_[data-icon]]:text-primary",
        loading: "[&_[data-icon]]:text-primary",
      },
    });
    expect(capturedProps?.toastOptions).toMatchObject({
      classNames: {
        closeButton: expect.stringContaining("!right-2.5 !top-2.5"),
      },
    });
    expect(capturedProps?.style).toMatchObject({
      "--width": "min(28rem, calc(100vw - 2rem))",
      "--toast-close-button-start": "unset",
      "--toast-close-button-end": "0.75rem",
      "--toast-close-button-transform": "none",
      "--toast-icon-margin-start": "0px",
      "--toast-icon-margin-end": "0px",
      "--toast-svg-margin-start": "0px",
      "--toast-svg-margin-end": "0px",
    });
  });
});
