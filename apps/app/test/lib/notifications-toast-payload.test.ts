import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/http";

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
            REQUEST_FAILED: "Request failed. Please try again.",
            WORKSPACE_NOT_FOUND: "Workspace not found.",
          }) as const
        )[key as "TOAST_TITLE_ERROR" | "TOAST_TITLE_INFO" | "TOAST_TITLE_SUCCESS"] ?? key,
    },
  };
});

describe("notifications toast payloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("includes the trace id from ApiError metadata in error toasts", async () => {
    const { notifyError } = await import("@/lib/notifications");

    notifyError(
      new ApiError({
        status: 500,
        message: "Something broke.",
        meta: { trace_id: "req_456" },
      }),
    );

    expect(messageErrorMock).toHaveBeenCalledWith({
      title: "Oops! Something went wrong.",
      description: "Request failed. Please try again.",
      requestId: "req_456",
    });
  });

  it("keeps translated API errors and hides untranslated backend messages", async () => {
    const { getErrorMessage } = await import("@/lib/notifications");

    expect(
      getErrorMessage(
        new ApiError({
          status: 404,
          error: "WORKSPACE_NOT_FOUND",
          message: "workspace row 42 missing",
        }),
      ),
    ).toBe("Workspace not found.");
    expect(
      getErrorMessage(
        new ApiError({
          status: 500,
          error: "UNMAPPED_INTERNAL_ERROR",
          message: "database connection reset by peer",
        }),
      ),
    ).toBe("Request failed. Please try again.");
  });

  it("keeps explicitly authored local product messages", async () => {
    const { getErrorMessage } = await import("@/lib/notifications");

    expect(getErrorMessage(new Error("Choose a workspace first."))).toBe(
      "Choose a workspace first.",
    );
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
