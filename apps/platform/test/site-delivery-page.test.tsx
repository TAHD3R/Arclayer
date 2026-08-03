import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PlatformDeliveryDomainDossierOut,
  PlatformDeliveryDomainOut,
  PlatformDeliveryIssueDossierOut,
  PlatformDeliveryIssueOut,
  PlatformDeliveryOperationOut,
  PlatformDeliveryStorageDossierOut,
  PlatformDeliveryStorageOut,
  StorageProfileOut,
} from "@arclayer/platform-openapi";

import {
  applyDeliveryPolicy,
  executeDeliveryIssueAction,
  getDeliveryDomainDossier,
  getDeliveryContinuityPolicy,
  getDeliveryIssueDossier,
  getDeliveryStorageDossier,
  listDeliveryDomains,
  listDeliveryIssues,
  listDeliveryRules,
  listDeliveryStorage,
  listStorageProfiles,
  PlatformSiteDeliveryApiError,
  previewDeliveryPolicy,
  recoverDeliveryDomain,
  testDeliveryStorage,
} from "@/site-delivery/site-delivery-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import {
  SiteDeliveryDomainsPage,
  SiteDeliveryIssuesPage,
  SiteDeliveryRulesPage,
  SiteDeliveryStoragePage,
} from "@/pages/site-delivery";

vi.mock("@/site-delivery/site-delivery-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/site-delivery/site-delivery-api")>();
  return {
    ...actual,
    applyDeliveryPolicy: vi.fn(),
    executeDeliveryIssueAction: vi.fn(),
    getDeliveryDomainDossier: vi.fn(),
    getDeliveryContinuityPolicy: vi.fn(),
    getDeliveryIssueDossier: vi.fn(),
    getDeliveryStorageDossier: vi.fn(),
    listDeliveryDomains: vi.fn(),
    listDeliveryIssues: vi.fn(),
    listDeliveryRules: vi.fn(),
    listDeliveryStorage: vi.fn(),
    listStorageProfiles: vi.fn(),
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

const DELIVERY_REVISION = "2026-08-02T04:00:00.000Z";

function deliveryOperation(
  action: PlatformDeliveryOperationOut["action"],
  overrides: Partial<PlatformDeliveryOperationOut> = {},
): PlatformDeliveryOperationOut {
  return {
    action,
    beforeState: "failed",
    completedAt: "2026-08-02T04:01:00.000Z",
    createdAt: "2026-08-02T04:00:00.000Z",
    evidence: {},
    failedTargetCount: 0,
    failureCode: null,
    failureMessage: null,
    id: "operation-1",
    replayed: false,
    resultReferenceId: null,
    resultingState: "queued",
    sourceOperationIdentity: null,
    state: "source_confirmed",
    targetId: "issue-1",
    targetType: "publish_job",
    verificationState: "confirmed",
    ...overrides,
  };
}

function deliveryIssue(
  overrides: Partial<PlatformDeliveryIssueOut> = {},
): PlatformDeliveryIssueOut {
  return {
    correlationId: null,
    id: "issue-1",
    kind: "publish_job",
    occurredAt: DELIVERY_REVISION,
    projectId: "project-1",
    retryable: true,
    siteId: "site-1",
    state: "failed",
    summaryKey: "siteDelivery:PUBLISH_FAILED",
    visitorEffect: "site_unavailable",
    workspaceId: "workspace-1",
    ...overrides,
  };
}

function issueDossier(
  overrides: Partial<PlatformDeliveryIssueDossierOut> = {},
): PlatformDeliveryIssueDossierOut {
  return {
    actions: [],
    dependencies: [],
    evidence: [],
    id: "issue-1",
    kind: "hosting_continuity",
    occurredAt: DELIVERY_REVISION,
    operations: [],
    retryable: true,
    revision: DELIVERY_REVISION,
    scope: { projectId: "project-1", siteId: "site-1", workspaceId: "workspace-1" },
    sourceIdentity: "hosting-issue-1",
    state: "restoration_required",
    summaryKey: "siteDelivery:HOSTING_CONTINUITY_REQUIRED",
    visitorEffect: "site_unavailable",
    ...overrides,
  };
}

function deliveryDomain(
  overrides: Partial<PlatformDeliveryDomainOut> = {},
): PlatformDeliveryDomainOut {
  return {
    certificateStatus: "pending",
    hostname: "example.com",
    id: "domain-1",
    isActive: true,
    isVerified: false,
    projectId: "project-1",
    readiness: "verification_required",
    siteId: "site-1",
    source: "custom",
    updatedAt: DELIVERY_REVISION,
    workspaceId: "workspace-1",
    ...overrides,
  };
}

function domainDossier(): PlatformDeliveryDomainDossierOut {
  return {
    actions: [],
    certificateStatus: "pending",
    dependencies: [],
    evidence: [],
    hostname: "example.com",
    id: "domain-1",
    isActive: true,
    isVerified: false,
    operations: [],
    readiness: "verification_required",
    revision: DELIVERY_REVISION,
    scope: { projectId: "project-1", siteId: "site-1", workspaceId: "workspace-1" },
    source: "custom",
  };
}

function deliveryStorage(
  overrides: Partial<PlatformDeliveryStorageOut> = {},
): PlatformDeliveryStorageOut {
  return {
    displayName: "Primary storage",
    id: "storage-1",
    isActive: true,
    isDefault: true,
    lastTestStatus: null,
    lastTestedAt: null,
    profileKey: "primary",
    provider: "s3",
    ...overrides,
  };
}

function storageDossier(): PlatformDeliveryStorageDossierOut {
  return {
    actions: [],
    configSource: "platform",
    dependencies: [],
    displayName: "Primary storage",
    evidence: [],
    id: "storage-1",
    isActive: true,
    isDefault: true,
    lastTestStatus: null,
    lastTestedAt: null,
    operations: [],
    profileKey: "primary",
    provider: "s3",
    readiness: "unknown",
    revision: DELIVERY_REVISION,
    scope: { workspaceId: "workspace-1" },
    tombstonedAt: null,
  };
}

function storageProfile(overrides: Partial<StorageProfileOut> = {}): StorageProfileOut {
  return {
    config: {
      accessKeyId: "access-key",
      bucket: "assets",
      endpointUrl: "https://storage.example.com",
      forcePathStyle: false,
      presignExpiresSeconds: 3600,
      publicBaseUrl: null,
      publicBucket: null,
      publicDeliveryMode: "proxy",
      region: "us-east-1",
    },
    configSource: "database",
    createdAt: DELIVERY_REVISION,
    displayName: "Primary storage",
    id: "storage-1",
    isActive: true,
    isDefault: true,
    lastTestMessage: null,
    lastTestStatus: null,
    lastTestedAt: null,
    profileKey: "primary",
    provider: "aws_s3",
    scopeId: "system",
    scopeType: "system",
    secrets: { secretAccessKey: true },
    updatedAt: DELIVERY_REVISION,
    ...overrides,
  };
}

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(listDeliveryIssues).mockResolvedValue(page([deliveryIssue()]));
  vi.mocked(listDeliveryDomains).mockResolvedValue(page([]));
  vi.mocked(listDeliveryStorage).mockResolvedValue(page([]));
  vi.mocked(listStorageProfiles).mockResolvedValue({ items: [] });
  vi.mocked(listDeliveryRules).mockResolvedValue(page([]));
  vi.mocked(getDeliveryIssueDossier).mockResolvedValue(issueDossier());
  vi.mocked(getDeliveryDomainDossier).mockResolvedValue(domainDossier());
  vi.mocked(getDeliveryStorageDossier).mockResolvedValue(storageDossier());
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
      expect(executeDeliveryIssueAction).toHaveBeenCalledWith("issue-1", "retry", {
        expectedRevision: DELIVERY_REVISION,
        idempotencyKey: expect.any(String),
      }),
    );

    pending.resolve(deliveryOperation("retry"));

    expect(await screen.findByText("Recovery action completed")).toBeVisible();
    expect(screen.getByText("Action: retry · resulting status: queued")).toBeVisible();
  });

  it("uses the issue dossier revision for retry, reconcile, and restore", async () => {
    vi.mocked(listDeliveryIssues).mockResolvedValue(
      page([deliveryIssue({ kind: "hosting_continuity", state: "restoration_required" })]),
    );
    vi.mocked(executeDeliveryIssueAction).mockImplementation(async (_issueId, action) =>
      deliveryOperation(action),
    );
    const user = userEvent.setup();

    render(<SiteDeliveryIssuesPage />);

    for (const [label, action] of [
      ["Retry", "retry"],
      ["Check status", "reconcile"],
      ["Restore delivery", "restore"],
    ] as const) {
      await user.click(await screen.findByRole("button", { name: label }));
      await waitFor(() =>
        expect(executeDeliveryIssueAction).toHaveBeenLastCalledWith("issue-1", action, {
          expectedRevision: DELIVERY_REVISION,
          idempotencyKey: expect.any(String),
        }),
      );
    }

    expect(getDeliveryIssueDossier).toHaveBeenCalledTimes(3);
  });

  it("refreshes the dossier and request after a revision conflict", async () => {
    const refreshedRevision = "2026-08-02T04:05:00.000Z";
    vi.mocked(getDeliveryIssueDossier)
      .mockResolvedValueOnce(issueDossier())
      .mockResolvedValueOnce(issueDossier({ revision: refreshedRevision }));
    vi.mocked(executeDeliveryIssueAction)
      .mockRejectedValueOnce(
        new PlatformSiteDeliveryApiError("HOSTING_DELIVERY_OPERATION_STALE", 409),
      )
      .mockResolvedValueOnce(deliveryOperation("retry"));
    const user = userEvent.setup();

    render(<SiteDeliveryIssuesPage />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("site-delivery-action-error-code")).toHaveTextContent(
      "HOSTING_DELIVERY_OPERATION_STALE",
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(executeDeliveryIssueAction).toHaveBeenCalledTimes(2));

    const requests = vi.mocked(executeDeliveryIssueAction).mock.calls.map((call) => call[2]);
    expect(requests).toEqual([
      { expectedRevision: DELIVERY_REVISION, idempotencyKey: expect.any(String) },
      { expectedRevision: refreshedRevision, idempotencyKey: expect.any(String) },
    ]);
    expect(requests[1]?.idempotencyKey).not.toBe(requests[0]?.idempotencyKey);
    expect(getDeliveryIssueDossier).toHaveBeenCalledTimes(2);
  });

  it("uses the domain dossier revision before recovering a domain", async () => {
    vi.mocked(listDeliveryDomains).mockResolvedValue(page([deliveryDomain()]));
    vi.mocked(recoverDeliveryDomain).mockResolvedValue(
      deliveryOperation("verify_ownership", {
        targetId: "domain-1",
        targetType: "domain_binding",
      }),
    );
    const user = userEvent.setup();

    render(<SiteDeliveryDomainsPage />);

    await user.click(await screen.findByRole("button", { name: "Verify ownership" }));

    await waitFor(() =>
      expect(recoverDeliveryDomain).toHaveBeenCalledWith("domain-1", {
        expectedRevision: DELIVERY_REVISION,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(getDeliveryDomainDossier).toHaveBeenCalledWith("domain-1");
  });

  it("uses the storage dossier revision before testing storage", async () => {
    vi.mocked(listDeliveryStorage).mockResolvedValue(page([deliveryStorage()]));
    vi.mocked(listStorageProfiles).mockResolvedValue({ items: [storageProfile()] });
    vi.mocked(testDeliveryStorage).mockResolvedValue(
      deliveryOperation("test_readiness", {
        targetId: "storage-1",
        targetType: "storage_profile",
      }),
    );
    const user = userEvent.setup();

    render(<SiteDeliveryStoragePage />);

    await user.click(await screen.findByRole("button", { name: "Test connection" }));

    await waitFor(() =>
      expect(testDeliveryStorage).toHaveBeenCalledWith("storage-1", {
        expectedRevision: DELIVERY_REVISION,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(getDeliveryStorageDossier).toHaveBeenCalledWith("storage-1");
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
      await screen.findByRole("spinbutton", { name: "Site availability window in seconds" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Site availability window in seconds" }),
      "300",
    );
    await user.click(screen.getByRole("button", { name: "Preview impact" }));

    await waitFor(() => expect(previewDeliveryPolicy).toHaveBeenCalledWith(7, 300));
    expect(await screen.findByText("Review policy impact")).toBeVisible();

    await user.type(
      screen.getByLabelText("Reason for this change"),
      "Increase continuity coverage",
    );
    await user.click(screen.getByRole("button", { name: "Apply policy change" }));

    await waitFor(() =>
      expect(applyDeliveryPolicy).toHaveBeenCalledWith(
        "preview-1",
        "Increase continuity coverage",
        expect.any(String),
      ),
    );
    expect(await screen.findByText("Policy change applied")).toBeVisible();
    expect(screen.getByText(/Version 8 now keeps sites available for 300 seconds/)).toBeVisible();
  });

  it("reuses a policy apply key until the desired intent or preview changes", async () => {
    vi.mocked(previewDeliveryPolicy)
      .mockResolvedValueOnce({
        affectedActiveTransitionCount: 2,
        continuityWindowSeconds: 300,
        expectedRevision: 7,
        id: "preview-1",
        partialFailure: false,
        proposedRevision: 8,
      })
      .mockResolvedValueOnce({
        affectedActiveTransitionCount: 2,
        continuityWindowSeconds: 300,
        expectedRevision: 7,
        id: "preview-2",
        partialFailure: false,
        proposedRevision: 8,
      });
    vi.mocked(applyDeliveryPolicy)
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        affectedActiveTransitionCount: 2,
        appliedAt: "2026-08-02T04:30:00.000Z",
        continuityWindowSeconds: 300,
        partialFailure: false,
        policyRevision: 8,
        replayed: true,
      });
    const user = userEvent.setup();

    render(<SiteDeliveryRulesPage />);

    const windowInput = await screen.findByRole("spinbutton", {
      name: "Site availability window in seconds",
    });
    await user.clear(windowInput);
    await user.type(windowInput, "300");
    await user.click(screen.getByRole("button", { name: "Preview impact" }));
    await user.type(await screen.findByLabelText("Reason for this change"), "Continuity update");

    await user.click(screen.getByRole("button", { name: "Apply policy change" }));
    expect(await screen.findByTestId("site-delivery-action-error-code")).toHaveTextContent(
      "network",
    );
    await user.click(screen.getByRole("button", { name: "Apply policy change" }));
    await waitFor(() => expect(applyDeliveryPolicy).toHaveBeenCalledTimes(2));

    const reasonInput = screen.getByLabelText("Reason for this change");
    await user.clear(reasonInput);
    await user.type(reasonInput, "Revised continuity update");
    await user.click(screen.getByRole("button", { name: "Apply policy change" }));
    await waitFor(() => expect(applyDeliveryPolicy).toHaveBeenCalledTimes(3));

    const keys = vi.mocked(applyDeliveryPolicy).mock.calls.map((call) => call[2]);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Preview impact" }));
    await user.click(await screen.findByRole("button", { name: "Apply policy change" }));
    await waitFor(() => expect(applyDeliveryPolicy).toHaveBeenCalledTimes(4));

    expect(vi.mocked(applyDeliveryPolicy).mock.calls[3]?.[2]).not.toBe(keys[2]);
    expect(await screen.findByText("Policy change confirmed")).toBeVisible();
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
