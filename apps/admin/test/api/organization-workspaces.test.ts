import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import {
  checkOrganizationWorkspaceSlugAvailability,
  createOrganizationWorkspace,
} from "@/api/organization-workspaces";

describe("api/organization-workspaces", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it("checks slug availability under the current organization scope", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      normalizedSlug: "blog-team",
      available: true,
      reason: null,
    });

    await checkOrganizationWorkspaceSlugAvailability(undefined, "Blog Team");

    expect(api.get).toHaveBeenCalledWith(
      "/organizations/me/workspaces/slug-availability?slug=Blog+Team",
    );
  });

  it("posts workspace creation payloads with explicit slug fields", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      workspaceId: "ws-1",
      organizationId: "org-1",
      slug: "blog-team",
      name: "Blog Team",
      description: "Publishing workspace",
      iconMode: "initials",
      iconColor: "#337ea9",
      iconUrl: null,
      isArchived: false,
      archivedAt: null,
      archivedByUserId: null,
      memberCount: 1,
      membersPreview: [],
      createdAt: "2026-04-17T00:00:00Z",
      enterable: true,
    });

    await createOrganizationWorkspace(undefined, {
      name: "Blog Team",
      slug: "blog-team",
      description: "Publishing workspace",
      template: "blank",
    });

    expect(api.post).toHaveBeenCalledWith("/organizations/me/workspaces", {
      name: "Blog Team",
      slug: "blog-team",
      description: "Publishing workspace",
      template: "blank",
    });
  });
});
