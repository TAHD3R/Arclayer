import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: { get: vi.fn() },
}));

import { getPlatformEntryEligibility } from "@/api/platform-entry";
import { api } from "@/lib/http";

describe("api/platform entry contract", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue({ eligible: false });
  });

  it("calls the Product eligibility projection without context parameters", async () => {
    const controller = new AbortController();

    await getPlatformEntryEligibility(controller.signal);

    expect(api.get).toHaveBeenCalledWith("/me/platform-entry-eligibility", {
      signal: controller.signal,
    });
  });
});
