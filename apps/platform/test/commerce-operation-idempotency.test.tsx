import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCommerceDunningPolicy,
  getCommerceProvider,
  listCommerceProviderEvents,
  putCommerceDunningPolicy,
  reconcileCommerceProviderEvent,
} from "@/commerce/commerce-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { CommerceConfigurationPage } from "@/pages/commerce-configuration";
import { CommercePaymentsPage } from "@/pages/commerce-payments";

vi.mock("@/commerce/commerce-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/commerce/commerce-api")>();
  return {
    ...actual,
    getCommerceDunningPolicy: vi.fn(),
    getCommerceProvider: vi.fn(),
    listCommerceProviderEvents: vi.fn(),
    putCommerceDunningPolicy: vi.fn(),
    reconcileCommerceProviderEvent: vi.fn(),
  };
});

const provider = () =>
  ({
    configured: true,
    connectorRegistered: true,
    missingPrerequisites: [],
    provider: "stripe",
    supportedCapabilities: ["subscriptions"],
    webhookReady: true,
  }) as Awaited<ReturnType<typeof getCommerceProvider>>;

const dunningPolicy = () =>
  ({
    isActive: true,
    policy: { retrySchedule: [1] },
    provider: "stripe",
    providerMode: "test",
    revision: 4,
  }) as Awaited<ReturnType<typeof getCommerceDunningPolicy>>;

const providerEvents = (processingAttempts: number) =>
  ({
    items: [
      {
        eventType: "invoice.payment_failed",
        id: "event-1",
        processingAttempts,
        provider: "stripe",
        providerEventId: "evt-1",
        status: "failed",
      },
    ],
    total: 1,
  }) as Awaited<ReturnType<typeof listCommerceProviderEvents>>;

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(getCommerceDunningPolicy).mockResolvedValue(dunningPolicy());
  vi.mocked(getCommerceProvider).mockResolvedValue(provider());
});

afterEach(cleanup);

describe("Commerce operation idempotency", () => {
  it("reuses a dunning-policy write key until the submitted policy changes", async () => {
    vi.mocked(putCommerceDunningPolicy).mockRejectedValue(new Error("network result unknown"));
    const user = userEvent.setup();

    render(<CommerceConfigurationPage />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const rules = screen.getByLabelText("Payment recovery rules");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(
      "The service has not confirmed this billing change. Nothing is treated as updated.",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putCommerceDunningPolicy).toHaveBeenCalledTimes(2));

    const firstKey = vi.mocked(putCommerceDunningPolicy).mock.calls[0]?.[0].idempotencyKey;
    const secondKey = vi.mocked(putCommerceDunningPolicy).mock.calls[1]?.[0].idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);

    fireEvent.change(rules, { target: { value: '{"retrySchedule":[1,2]}' } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putCommerceDunningPolicy).toHaveBeenCalledTimes(3));
    expect(vi.mocked(putCommerceDunningPolicy).mock.calls[2]?.[0].idempotencyKey).not.toBe(
      firstKey,
    );
  });

  it("reuses a provider-event reconciliation key after an unconfirmed result", async () => {
    vi.mocked(listCommerceProviderEvents).mockResolvedValue(providerEvents(1));
    vi.mocked(reconcileCommerceProviderEvent)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockRejectedValueOnce(new Error("network result unknown"));
    const user = userEvent.setup();

    render(<CommercePaymentsPage />);

    const reconcile = await screen.findByRole("button", { name: "Check event" });
    await user.click(reconcile);
    await screen.findByText(
      "The service has not confirmed this billing change. Nothing is treated as updated.",
    );
    await user.click(screen.getByRole("button", { name: "Check event" }));
    await waitFor(() => expect(reconcileCommerceProviderEvent).toHaveBeenCalledTimes(2));

    const firstKey = vi.mocked(reconcileCommerceProviderEvent).mock.calls[0]?.[1].idempotencyKey;
    const secondKey = vi.mocked(reconcileCommerceProviderEvent).mock.calls[1]?.[1].idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });
});
