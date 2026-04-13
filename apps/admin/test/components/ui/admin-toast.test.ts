import { describe, expect, it, vi } from "vitest";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();
const toastWarningMock = vi.fn();

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

  it("keeps plain string calls working as title-only toasts", async () => {
    const { message } = await import("@arclayer/ui/admin-toast");

    message.error("Upload failed");

    expect(toastErrorMock).toHaveBeenCalledWith("Upload failed", {
      description: undefined,
    });
  });
});
