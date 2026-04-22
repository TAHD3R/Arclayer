import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { listOrganizationInviteLinkParticipants } from "@/api/organization-members";

describe("api/organization-members", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("encodes invite-link participants query with q for organization scope", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [],
      page: 2,
      size: 15,
      total: 0,
      pages: 0,
      next: null,
      prev: null,
    });

    await listOrganizationInviteLinkParticipants("link-1", { page: 2, size: 15, q: "ada" });

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      "/organizations/me/invitations/links/link-1/participants?page=2&size=15&q=ada",
    );
  });
});
