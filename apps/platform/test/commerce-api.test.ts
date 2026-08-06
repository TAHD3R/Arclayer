import {
  platformCommerceCreatePlanRevision,
  platformCommerceListCommerceProviderEvents,
  platformCommerceListPlatformCommerceInvoices,
  platformCommerceListPlatformCommerceRefunds,
  platformCommerceListPlatformCommerceTransactions,
  platformCommerceGetCommerceSimulator,
  platformCommerceGetSimulatedCommerceState,
  platformCommerceReconcileCommerceProviderEvent,
  platformCommerceRecordCommercePaymentCorrection,
  platformCommerceSubmitSimulatedCheckoutOutcome,
  platformCommerceSubmitSimulatedTopUpOutcome,
} from "@arclayer/platform-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlanRevision,
  listCommerceProviderEvents,
  listCommerceInvoices,
  listCommerceRefunds,
  listCommerceTransactions,
  getCommerceSimulator,
  getSimulatedCommerceState,
  reconcileCommerceProviderEvent,
  recordCommercePaymentCorrection,
  submitSimulatedCheckoutOutcome,
  submitSimulatedTopUpOutcome,
} from "@/commerce/commerce-api";
import { platformApiClient } from "@/api/client";

vi.mock("@arclayer/platform-openapi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/platform-openapi")>();
  return {
    ...actual,
    platformCommerceCreatePlanRevision: vi.fn(),
    platformCommerceListCommerceProviderEvents: vi.fn(),
    platformCommerceListPlatformCommerceInvoices: vi.fn(),
    platformCommerceListPlatformCommerceRefunds: vi.fn(),
    platformCommerceListPlatformCommerceTransactions: vi.fn(),
    platformCommerceGetCommerceSimulator: vi.fn(),
    platformCommerceGetSimulatedCommerceState: vi.fn(),
    platformCommerceReconcileCommerceProviderEvent: vi.fn(),
    platformCommerceRecordCommercePaymentCorrection: vi.fn(),
    platformCommerceSubmitSimulatedCheckoutOutcome: vi.fn(),
    platformCommerceSubmitSimulatedTopUpOutcome: vi.fn(),
  };
});
vi.unmock("@/commerce/commerce-api");

const response = <T>(data: T) => ({
  data: { data, message: "OK", timestamp: 1 },
  request: new Request("https://platform.test/platform-api/v1/commerce"),
  response: new Response(null, { status: 200 }),
});

describe("Platform commerce API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a revision through the generated SDK with an idempotency header", async () => {
    const terms = {
      creditGrantAmount: 0,
      creditRefreshInterval: "none" as const,
      creditValueMicros: 0,
      currency: "USD",
      descriptionI18NKey: "plan.description",
      nameI18NKey: "plan.name",
    };
    vi.mocked(platformCommerceCreatePlanRevision).mockResolvedValue(
      response({ id: "revision-1", planId: "plan-1", revision: 1, sequence: 1, status: "draft" }),
    );

    await expect(createPlanRevision("starter", { terms }, "idem-1")).resolves.toMatchObject({
      id: "revision-1",
    });
    expect(platformCommerceCreatePlanRevision).toHaveBeenCalledWith({
      body: { terms },
      client: platformApiClient,
      headers: { "Idempotency-Key": "idem-1" },
      path: { code: "starter" },
    });
  });

  it("loads provider evidence and reconciles a failed event through the generated SDK", async () => {
    vi.mocked(platformCommerceListCommerceProviderEvents).mockResolvedValue(
      response({ items: [], total: 0 }),
    );
    vi.mocked(platformCommerceReconcileCommerceProviderEvent).mockResolvedValue(
      response({
        id: "event-1",
        eventType: "invoice.failed",
        payloadSha256: "sha",
        processingAttempts: 2,
        provider: "stripe",
        providerAccountId: "acct",
        providerEventId: "evt",
        providerMode: "live",
        signatureTimestamp: "2026-08-02T00:00:00Z",
        status: "processed",
      }),
    );

    await expect(listCommerceProviderEvents({ page: 1, pageSize: 50 })).resolves.toEqual({
      items: [],
      total: 0,
    });
    await reconcileCommerceProviderEvent("event-1", {
      expectedProcessingAttempts: 2,
      idempotencyKey: "idem-2",
    });

    expect(platformCommerceListCommerceProviderEvents).toHaveBeenCalledWith({
      client: platformApiClient,
      query: { page: 1, pageSize: 50 },
    });
    expect(platformCommerceReconcileCommerceProviderEvent).toHaveBeenCalledWith({
      body: { expectedProcessingAttempts: 2, idempotencyKey: "idem-2" },
      client: platformApiClient,
      path: { event_id: "event-1" },
    });
  });

  it("loads payment projections through typed list wrappers", async () => {
    vi.mocked(platformCommerceListPlatformCommerceTransactions).mockResolvedValue(
      response({ items: [], total: 0 }),
    );
    vi.mocked(platformCommerceListPlatformCommerceInvoices).mockResolvedValue(
      response({ items: [], total: 0 }),
    );
    vi.mocked(platformCommerceListPlatformCommerceRefunds).mockResolvedValue(
      response({ items: [], total: 0 }),
    );

    await expect(
      listCommerceTransactions({ page: 2, pageSize: 10, provider: "stripe" }),
    ).resolves.toEqual({
      items: [],
      total: 0,
    });
    await expect(listCommerceInvoices({ page: 1, pageSize: 25, status: "paid" })).resolves.toEqual({
      items: [],
      total: 0,
    });
    await expect(listCommerceRefunds({ page: 3, pageSize: 5, status: "pending" })).resolves.toEqual(
      {
        items: [],
        total: 0,
      },
    );

    expect(platformCommerceListPlatformCommerceTransactions).toHaveBeenCalledWith({
      client: platformApiClient,
      query: { page: 2, pageSize: 10, provider: "stripe" },
    });
    expect(platformCommerceListPlatformCommerceInvoices).toHaveBeenCalledWith({
      client: platformApiClient,
      query: { page: 1, pageSize: 25, status: "paid" },
    });
    expect(platformCommerceListPlatformCommerceRefunds).toHaveBeenCalledWith({
      client: platformApiClient,
      query: { page: 3, pageSize: 5, status: "pending" },
    });
  });

  it("records Provider payment correction facts through the reconciliation SDK", async () => {
    vi.mocked(platformCommerceRecordCommercePaymentCorrection).mockResolvedValue(
      response({
        correctionId: "correction-1",
        disposition: "reconciliation_required",
        workspaceId: null,
        transactionId: null,
        invoiceId: null,
        refundId: null,
        creditConsequence: null,
        failureCode: "BILLING_PAYMENT_RECONCILIATION_REQUIRED",
      }),
    );

    const body = {
      provider: "stripe" as const,
      providerMode: "test" as const,
      providerAccountId: "acct_test",
      providerEventId: "evt_correction",
      externalTransactionId: "pi_123",
      externalInvoiceId: null,
      externalRefundId: "re_123",
      transactionStatus: "succeeded" as const,
      invoiceStatus: "paid" as const,
      refundStatus: "succeeded" as const,
      currency: "USD",
      amountMicros: 5_000_000,
      amountRefundedMicros: 5_000_000,
      creditAmount: 500,
      providerEventOccurredAt: "2026-08-06T00:00:00Z",
      reason: "provider refund consequence review",
      evidenceReference: "ticket-123",
      idempotencyKey: "correction-123",
    };

    await expect(recordCommercePaymentCorrection(body)).resolves.toMatchObject({
      correctionId: "correction-1",
    });
    expect(platformCommerceRecordCommercePaymentCorrection).toHaveBeenCalledWith({
      body,
      client: platformApiClient,
    });
  });

  it("keeps simulator readiness and outcome commands on explicit Platform SDK paths", async () => {
    vi.mocked(platformCommerceGetCommerceSimulator).mockResolvedValue(
      response({
        enabled: true,
        environment: "test",
        provider: "simulated",
        signingConfigured: true,
        connectorRegistered: true,
        supportedOutcomes: ["pending", "succeeded", "failed", "canceled"],
        rejectionCode: null,
      }),
    );
    vi.mocked(platformCommerceSubmitSimulatedCheckoutOutcome).mockResolvedValue(
      response({
        checkoutSessionId: "checkout-1",
        outcome: "succeeded",
        providerEventId: "sim_evt_1",
        accepted: true,
        eventCreated: true,
        inboxId: "inbox-1",
        jobId: "job-1",
      }),
    );
    vi.mocked(platformCommerceSubmitSimulatedTopUpOutcome).mockResolvedValue(
      response({
        checkoutSessionId: "checkout-2",
        outcome: "failed",
        providerEventId: "sim_evt_2",
        accepted: true,
        eventCreated: true,
        inboxId: "inbox-2",
        jobId: "job-2",
      }),
    );

    await expect(getCommerceSimulator()).resolves.toMatchObject({ enabled: true });
    vi.mocked(platformCommerceGetSimulatedCommerceState).mockResolvedValue(
      response({
        workspaceId: "workspace-1",
        checkouts: [],
        outcomeCommands: [],
        inboxes: [],
        jobs: [],
        transactions: [],
        invoices: [],
        refunds: [],
        applications: [],
        corrections: [],
      }),
    );
    await expect(getSimulatedCommerceState("workspace-1")).resolves.toMatchObject({
      workspaceId: "workspace-1",
    });
    await submitSimulatedCheckoutOutcome(
      "workspace-1",
      "checkout-1",
      { outcome: "succeeded", expectedRevision: 1 },
      "idem-checkout",
    );
    await submitSimulatedTopUpOutcome(
      "workspace-1",
      "checkout-2",
      { outcome: "failed", expectedRevision: 1 },
      "idem-top-up",
    );

    expect(platformCommerceGetCommerceSimulator).toHaveBeenCalledWith({
      client: platformApiClient,
    });
    expect(platformCommerceGetSimulatedCommerceState).toHaveBeenCalledWith({
      client: platformApiClient,
      path: { workspace_id: "workspace-1" },
    });
    expect(platformCommerceSubmitSimulatedCheckoutOutcome).toHaveBeenCalledWith({
      body: { outcome: "succeeded", expectedRevision: 1 },
      client: platformApiClient,
      headers: { "Idempotency-Key": "idem-checkout" },
      path: { workspace_id: "workspace-1", checkout_session_id: "checkout-1" },
    });
    expect(platformCommerceSubmitSimulatedTopUpOutcome).toHaveBeenCalledWith({
      body: { outcome: "failed", expectedRevision: 1 },
      client: platformApiClient,
      headers: { "Idempotency-Key": "idem-top-up" },
      path: { workspace_id: "workspace-1", checkout_session_id: "checkout-2" },
    });
  });
});
