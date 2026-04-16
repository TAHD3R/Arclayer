import { describe, expect, it, vi } from "vitest";

const messageErrorMock = vi.fn();
const messageInfoMock = vi.fn();
const messageSuccessMock = vi.fn();

vi.mock("@arclayer/ui/admin-toast", () => ({
  message: {
    error: (...args: unknown[]) => messageErrorMock(...args),
    info: (...args: unknown[]) => messageInfoMock(...args),
    success: (...args: unknown[]) => messageSuccessMock(...args),
  },
}));

vi.mock("@/lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/i18n")>();

  return {
    ...actual,
    i18n: {
      ...actual.i18n,
      t: (key: string) =>
        (
          ({
            TOAST_TITLE_ERROR: "Oops! Something went wrong.",
            TOAST_TITLE_INFO: "Heads up!",
            TOAST_TITLE_SUCCESS: "Success!",
          }) as const
        )[key as "TOAST_TITLE_ERROR" | "TOAST_TITLE_INFO" | "TOAST_TITLE_SUCCESS"] ?? key,
    },
  };
});

describe("notifications toast payloads", () => {
  it("uses a structured success toast with generic title and message description", async () => {
    const { notifySuccessText } = await import("@/lib/notifications");

    notifySuccessText("Workspace created.");

    expect(messageSuccessMock).toHaveBeenCalledWith({
      title: "Success!",
      description: "Workspace created.",
    });
  });

  it("uses a structured error toast with generic title and message description", async () => {
    const { notifyErrorText } = await import("@/lib/notifications");

    notifyErrorText("You do not have permission to do that.");

    expect(messageErrorMock).toHaveBeenCalledWith({
      title: "Oops! Something went wrong.",
      description: "You do not have permission to do that.",
    });
  });

  it("uses a structured info toast with generic title and message description", async () => {
    const { notifyInfoText } = await import("@/lib/notifications");

    notifyInfoText("Copied to clipboard.");

    expect(messageInfoMock).toHaveBeenCalledWith({
      title: "Heads up!",
      description: "Copied to clipboard.",
    });
  });
});
