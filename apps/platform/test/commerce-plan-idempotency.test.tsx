import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCommercePlan,
  createPlanRevision,
  listCommercePlans,
  publishPlanRevision,
} from "@/commerce/commerce-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { CommercePlansPage } from "@/pages/commerce-plans";

vi.mock("@/commerce/commerce-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/commerce/commerce-api")>();
  return {
    ...actual,
    createCommercePlan: vi.fn(),
    createPlanRevision: vi.fn(),
    listCommercePlans: vi.fn(),
    publishPlanRevision: vi.fn(),
  };
});

const catalog = () =>
  ({
    items: [
      {
        code: "starter",
        id: "plan-1",
        isActive: true,
        revisions: [
          {
            id: "revision-1",
            isSelling: false,
            publishedAt: null,
            revision: 3,
            sequence: 1,
            status: "draft",
          },
        ],
      },
      { code: "pro", id: "plan-2", isActive: true, revisions: [] },
    ],
  }) as Awaited<ReturnType<typeof listCommercePlans>>;

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(listCommercePlans).mockResolvedValue(catalog());
});

afterEach(cleanup);

describe("Commerce plan idempotency", () => {
  it("reuses a plan-create key on retry and rotates it for changed input", async () => {
    vi.mocked(createCommercePlan)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockRejectedValueOnce(new Error("network result unknown"));
    const user = userEvent.setup();

    render(<CommercePlansPage />);

    await user.click(await screen.findByRole("button", { name: "Create plan" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Plan code"), "starter");
    await user.click(within(dialog).getByRole("button", { name: "Create plan" }));
    await screen.findByText(
      "The service has not confirmed this billing change. Nothing is treated as updated.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(createCommercePlan).toHaveBeenCalledTimes(2));

    const firstKey = vi.mocked(createCommercePlan).mock.calls[0]?.[1];
    const secondKey = vi.mocked(createCommercePlan).mock.calls[1]?.[1];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);

    const code = within(dialog).getByLabelText("Plan code");
    await user.clear(code);
    await user.type(code, "growth");
    await user.click(within(dialog).getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(createCommercePlan).toHaveBeenCalledTimes(3));
    expect(vi.mocked(createCommercePlan).mock.calls[2]?.[1]).not.toBe(firstKey);
  });

  it("reuses a draft-create key for the same plan and rotates it for changed terms", async () => {
    vi.mocked(createPlanRevision).mockRejectedValue(new Error("network result unknown"));
    const user = userEvent.setup();

    render(<CommercePlansPage />);

    const [createDraft] = await screen.findAllByRole("button", { name: "Create draft version" });
    await user.click(createDraft!);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Create draft version" }));
    await screen.findByText(
      "The service has not confirmed this billing change. Nothing is treated as updated.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create draft version" }));
    await waitFor(() => expect(createPlanRevision).toHaveBeenCalledTimes(2));

    const firstKey = vi.mocked(createPlanRevision).mock.calls[0]?.[2];
    const secondKey = vi.mocked(createPlanRevision).mock.calls[1]?.[2];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);

    fireEvent.change(within(dialog).getByLabelText("Plan version terms"), {
      target: { value: '{"currency":"USD","creditGrantAmount":1}' },
    });
    await user.click(within(dialog).getByRole("button", { name: "Create draft version" }));
    await waitFor(() => expect(createPlanRevision).toHaveBeenCalledTimes(3));

    expect(vi.mocked(createPlanRevision).mock.calls[2]?.[2]).not.toBe(firstKey);
  });

  it("reuses a revision-publish key after an unconfirmed result", async () => {
    vi.mocked(publishPlanRevision)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockRejectedValueOnce(new Error("network result unknown"));
    const user = userEvent.setup();

    render(<CommercePlansPage />);

    await user.click(await screen.findByRole("button", { name: "Publish" }));
    await screen.findByText(
      "The service has not confirmed this billing change. Nothing is treated as updated.",
    );
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(publishPlanRevision).toHaveBeenCalledTimes(2));

    const firstKey = vi.mocked(publishPlanRevision).mock.calls[0]?.[3];
    const secondKey = vi.mocked(publishPlanRevision).mock.calls[1]?.[3];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });
});
