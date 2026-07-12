import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveSystemSubscriptionChangeRequest,
  listSystemSubscriptionChangeRequests,
  rejectSystemSubscriptionChangeRequest,
  type SubscriptionChangeRequest,
} from "@/api/commerce";
import { SubscriptionChangeRequestReview } from "@/pages/system/billing/change-request-review";

vi.mock("@/api/commerce", () => ({
  approveSystemSubscriptionChangeRequest: vi.fn(),
  listSystemSubscriptionChangeRequests: vi.fn(),
  rejectSystemSubscriptionChangeRequest: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

const pendingRequest: SubscriptionChangeRequest = {
  id: "request-1",
  workspaceId: "workspace-1",
  requestedByUserId: "user-1",
  planCode: "premium",
  planName: "高级版",
  billingInterval: "yearly",
  reason: null,
  status: "pending",
  reviewedByUserId: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: "2026-07-12T08:30:00Z",
  updatedAt: "2026-07-12T08:30:00Z",
};

function reviewedRequest(input: { status: "approved" | "rejected"; reviewNote: string }) {
  return {
    ...pendingRequest,
    status: input.status,
    reviewNote: input.reviewNote,
    reviewedByUserId: "operator-1",
    reviewedAt: "2026-07-12T09:00:00Z",
    updatedAt: "2026-07-12T09:00:00Z",
  } satisfies SubscriptionChangeRequest;
}

function renderReview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionChangeRequestReview />
    </QueryClientProvider>,
  );
  return { invalidateQueries };
}

describe("SubscriptionChangeRequestReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSystemSubscriptionChangeRequests).mockResolvedValue({
      items: [pendingRequest],
      total: 1,
      page: 1,
      size: 10,
      pages: 1,
      next: null,
      prev: null,
    });
    vi.mocked(approveSystemSubscriptionChangeRequest).mockResolvedValue(
      reviewedRequest({ status: "approved", reviewNote: "Approved after review" }),
    );
    vi.mocked(rejectSystemSubscriptionChangeRequest).mockResolvedValue(
      reviewedRequest({ status: "rejected", reviewNote: "Contract mismatch" }),
    );
  });

  it("approves a request and invalidates both the review queue and Header commerce summary", async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderReview();

    await user.click(
      await screen.findByRole("button", { name: "commerce:SETTINGS_REQUEST_APPROVE" }),
    );
    const dialog = await screen.findByRole("dialog");
    const scope = within(dialog);
    await user.type(
      scope.getByLabelText("commerce:SETTINGS_REQUEST_REVIEW_NOTE"),
      "Approved after review",
    );
    await user.click(scope.getByRole("button", { name: "commerce:SETTINGS_REQUEST_APPROVE" }));

    await waitFor(() => {
      expect(approveSystemSubscriptionChangeRequest).toHaveBeenCalledWith(
        "request-1",
        "Approved after review",
      );
    });
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["system", "commerce", "subscription-change-requests"],
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["commerce", "workspace"],
      });
    });
  });

  it("requires a rejection reason before rejecting and invalidates the Header summary", async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderReview();

    await user.click(
      await screen.findByRole("button", { name: "commerce:SETTINGS_REQUEST_REJECT" }),
    );
    const dialog = await screen.findByRole("dialog");
    const scope = within(dialog);
    expect(
      scope.getByText("commerce:SETTINGS_REQUEST_REJECT_DESCRIPTION:高级版"),
    ).toBeInTheDocument();
    const rejectButton = scope.getByRole("button", {
      name: "commerce:SETTINGS_REQUEST_REJECT",
    });
    const note = scope.getByLabelText("commerce:SETTINGS_REQUEST_REVIEW_NOTE");

    expect(rejectButton).toBeDisabled();
    expect(note).toHaveAttribute("aria-invalid", "true");
    await user.type(note, "   ");
    expect(rejectButton).toBeDisabled();
    expect(rejectSystemSubscriptionChangeRequest).not.toHaveBeenCalled();

    await user.clear(note);
    await user.type(note, "Contract mismatch");
    expect(rejectButton).toBeEnabled();
    await user.click(rejectButton);

    await waitFor(() => {
      expect(rejectSystemSubscriptionChangeRequest).toHaveBeenCalledWith(
        "request-1",
        "Contract mismatch",
      );
    });
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["commerce", "workspace"],
      });
    });
  });
});
