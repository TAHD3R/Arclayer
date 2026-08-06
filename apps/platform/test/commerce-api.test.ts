import {
  platformCommerceCreatePlanRevision,
  platformCommerceListCommerceProviderEvents,
  platformCommerceGetCommerceSimulator,
  platformCommerceReconcileCommerceProviderEvent,
  platformCommerceSubmitSimulatedCheckoutOutcome,
  platformCommerceSubmitSimulatedTopUpOutcome,
} from "@arclayer/platform-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlanRevision,
  listCommerceProviderEvents,
  getCommerceSimulator,
  reconcileCommerceProviderEvent,
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
    platformCommerceGetCommerceSimulator: vi.fn(),
    platformCommerceReconcileCommerceProviderEvent: vi.fn(),
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
