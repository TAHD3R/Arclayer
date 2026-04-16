import { describe, expect, it, vi } from "vitest";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();
const toastWarningMock = vi.fn();

vi.mock("react-i18next", () => ({
  getI18n: () => ({
    t: (key: string) =>
      (
        ({
          TOAST_TITLE_SUCCESS: "Success!",
          TOAST_TITLE_ERROR: "Oops! Something went wrong.",
          TOAST_TITLE_INFO: "Heads up!",
          TOAST_TITLE_WARNING: "Warning!",
        }) as const
      )[
        key as
          | "TOAST_TITLE_SUCCESS"
          | "TOAST_TITLE_ERROR"
          | "TOAST_TITLE_INFO"
          | "TOAST_TITLE_WARNING"
      ] ?? key,
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
});
