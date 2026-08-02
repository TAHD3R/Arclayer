import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyDeliveryPolicy,
  executeDeliveryIssueAction,
  getDeliveryContinuityPolicy,
  listDeliveryDomains,
  listDeliveryIssues,
  listDeliveryRules,
  listDeliveryStorage,
  PlatformSiteDeliveryApiError,
  previewDeliveryPolicy,
} from "@/site-delivery/site-delivery-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { SiteDeliveryIssuesPage, SiteDeliveryRulesPage } from "@/pages/site-delivery";

vi.mock("@/site-delivery/site-delivery-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/site-delivery/site-delivery-api")>();
  return {
    ...actual,
    applyDeliveryPolicy: vi.fn(),
    executeDeliveryIssueAction: vi.fn(),
    getDeliveryContinuityPolicy: vi.fn(),
    listDeliveryDomains: vi.fn(),
    listDeliveryIssues: vi.fn(),
    listDeliveryRules: vi.fn(),
    listDeliveryStorage: vi.fn(),
    previewDeliveryPolicy: vi.fn(),
    recoverDeliveryDomain: vi.fn(),
    testDeliveryStorage: vi.fn(),
  };
});

function page<T>(items: T[]) {
  return { items, next: null, page: 1, pages: 1, prev: null, size: 50, total: items.length };
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve: resolve! };
}

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(listDeliveryIssues).mockResolvedValue(
    page([
      {
        correlationId: null,
        id: "issue-1",
        kind: "publish_job",
        occurredAt: "2026-08-02T04:00:00.000Z",
        projectId: "project-1",
        retryable: true,
        siteId: "site-1",
        state: "failed",
        summaryKey: "siteDelivery:PUBLISH_FAILED",
        visitorEffect: "site_unavailable",
        workspaceId: "workspace-1",
      },
    ]),
  );
  vi.mocked(listDeliveryDomains).mockResolvedValue(page([]));
  vi.mocked(listDeliveryStorage).mockResolvedValue(page([]));
  vi.mocked(listDeliveryRules).mockResolvedValue(page([]));
  vi.mocked(getDeliveryContinuityPolicy).mockResolvedValue({
    affectedActiveTransitionCount: 2,
    continuityWindowSeconds: 120,
    isActive: true,
    revision: 7,
  });
});

afterEach(cleanup);

describe("Hosting and delivery pages", () => {
  it("keeps a delivery retry pending until the source returns its operation result", async () => {
    const pending = deferred<Awaited<ReturnType<typeof executeDeliveryIssueAction>>>();
    vi.mocked(executeDeliveryIssueAction).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();

    render(<SiteDeliveryIssuesPage />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    await waitFor(() =>
      expect(executeDeliveryIssueAction).toHaveBeenCalledWith("issue-1", "retry"),
    );

    pending.resolve({
      action: "retry",
      failedTargetCount: 0,
      id: "issue-1",
      kind: "publish_job",
      partialFailure: false,
      resultingState: "queued",
    });

    expect(await screen.findByText("Recovery command completed")).toBeVisible();
    expect(screen.getByText("Operation: retry · resulting state: queued")).toBeVisible();
  });

  it("uses the preview revision and an idempotency key when applying a delivery policy", async () => {
    vi.mocked(previewDeliveryPolicy).mockResolvedValue({
      affectedActiveTransitionCount: 2,
      continuityWindowSeconds: 300,
      expectedRevision: 7,
      id: "preview-1",
      partialFailure: false,
      proposedRevision: 8,
    });
    vi.mocked(applyDeliveryPolicy).mockResolvedValue({
      affectedActiveTransitionCount: 2,
      appliedAt: "2026-08-02T04:30:00.000Z",
      continuityWindowSeconds: 300,
      partialFailure: false,
      policyRevision: 8,
      replayed: false,
    });
    const user = userEvent.setup();

    render(<SiteDeliveryRulesPage />);

    await user.clear(
      await screen.findByRole("spinbutton", { name: "Continuity window in seconds" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Continuity window in seconds" }),
      "300",
    );
    await user.click(screen.getByRole("button", { name: "Preview impact" }));

    await waitFor(() => expect(previewDeliveryPolicy).toHaveBeenCalledWith(7, 300));
    expect(await screen.findByText("Review policy impact")).toBeVisible();

    await user.type(
      screen.getByLabelText("Reason for this change"),
      "Increase continuity coverage",
    );
    await user.click(screen.getByRole("button", { name: "Apply reviewed policy" }));

    await waitFor(() =>
      expect(applyDeliveryPolicy).toHaveBeenCalledWith(
        "preview-1",
        "Increase continuity coverage",
        expect.any(String),
      ),
    );
    expect(await screen.findByText("Policy revision applied")).toBeVisible();
    expect(screen.getByText(/Revision 8 now uses a 300-second continuity window/)).toBeVisible();
  });

  it("surfaces a stale policy preview as a conflict instead of applying it", async () => {
    vi.mocked(previewDeliveryPolicy).mockRejectedValueOnce(
      new PlatformSiteDeliveryApiError("HOSTING_CONTINUITY_POLICY_REVISION_STALE", 409),
    );
    const user = userEvent.setup();

    render(<SiteDeliveryRulesPage />);

    await user.click(await screen.findByRole("button", { name: "Preview impact" }));

    expect(await screen.findByText("This change needs a new review")).toBeVisible();
    expect(screen.getByTestId("site-delivery-action-error-code")).toHaveTextContent(
      "HOSTING_CONTINUITY_POLICY_REVISION_STALE",
    );
    expect(applyDeliveryPolicy).not.toHaveBeenCalled();
  });
});
