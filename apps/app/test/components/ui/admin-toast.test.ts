import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@arclayer/ui/tooltip";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();
const toastWarningMock = vi.fn();

vi.mock("react-i18next", () => ({
  getI18n: () => ({
    t: (key: string, options?: { id?: string }) => {
      const value =
        (
          {
            TOAST_TITLE_SUCCESS: "Success!",
            TOAST_TITLE_ERROR: "Oops! Something went wrong.",
            TOAST_TITLE_INFO: "Heads up!",
            TOAST_TITLE_WARNING: "Warning!",
            TOAST_REQUEST_ID_VALUE: "Request ID: {{id}}",
            TOAST_REQUEST_ID_TOOLTIP:
              "If you report this error to Customer Care, share this request ID so they can investigate.",
            TOAST_REQUEST_ID_COPY: "Copy request ID",
            TOAST_REQUEST_ID_COPIED: "Copied",
            TOAST_REQUEST_ID_COPY_FAILED: "Copy failed",
          } as const
        )[
          key as
            | "TOAST_TITLE_SUCCESS"
            | "TOAST_TITLE_ERROR"
            | "TOAST_TITLE_INFO"
            | "TOAST_TITLE_WARNING"
            | "TOAST_REQUEST_ID_VALUE"
            | "TOAST_REQUEST_ID_TOOLTIP"
            | "TOAST_REQUEST_ID_COPY"
            | "TOAST_REQUEST_ID_COPIED"
            | "TOAST_REQUEST_ID_COPY_FAILED"
        ] ?? key;

      return options?.id ? value.replace("{{id}}", options.id) : value;
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: (...args: unknown[]) => toastInfoMock(...args),
    warning: (...args: unknown[]) => toastWarningMock(...args),
  },
}));

describe("admin-toast message", () => {
  const writeTextMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
  });

  it("maps structured content into title and description payloads", async () => {
    const { message } = await import("@arclayer/ui/admin-toast");

    message.success({ title: "Saved", description: "Workspace settings were updated." });

    expect(toastSuccessMock).toHaveBeenCalledWith("Saved", {
      description: "Workspace settings were updated.",
    });
  });

  it("maps plain string calls into default titles with description payloads", async () => {
    const { message } = await import("@arclayer/ui/admin-toast");

    message.error("Upload failed");

    expect(toastErrorMock).toHaveBeenCalledWith("Oops! Something went wrong.", {
      description: "Upload failed",
    });
  });

  it("renders a request id popover with copy action for warning toasts", async () => {
    const { message } = await import("@arclayer/ui/admin-toast");

    writeTextMock.mockResolvedValue(undefined);

    message.warning({
      title: "Warning!",
      description: "Import completed with skipped rows.",
      requestId: "req_123",
    });

    expect(toastWarningMock).toHaveBeenCalledTimes(1);
    const [, payload] = toastWarningMock.mock.calls[0] as [string, { description?: ReactNode }];

    render(React.createElement(TooltipProvider, null, payload.description));

    expect(screen.getByText("Import completed with skipped rows.")).toBeInTheDocument();
    expect(screen.getByText("Request ID: req_123")).toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: "If you report this error to Customer Care, share this request ID so they can investigate.",
    });
    fireEvent.pointerEnter(trigger);

    expect(
      await screen.findByText(
        "If you report this error to Customer Care, share this request ID so they can investigate.",
      ),
    ).toBeInTheDocument();

    const copyButton = await screen.findByRole("button", { name: "Copy request ID" });
    fireEvent.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith("req_123");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getAllByText("Request ID: req_123")).toHaveLength(1);
  });
});
