import { describe, expect, it, vi } from "vitest";

import { resolveEditorDocument } from "@/routes/editor/site/-resolveEditorDocument";
import { resolvePortalRoute } from "@/runtime/portal-route-resolver";

vi.mock("@/runtime/portal-route-resolver", () => {
  return {
    resolvePortalRoute: vi.fn(),
  };
});

describe("resolveEditorDocument()", () => {
  it("throws 403 when token is missing", async () => {
    await expect(
      resolveEditorDocument({
        pathname: "/",
        context: { siteCtx: { siteId: "s1" } },
        locationSearch: {},
      }),
    ).rejects.toMatchObject({ name: "HttpError", status: 403 });
  });

  it("returns document when API resolver returns a page", async () => {
    vi.mocked(resolvePortalRoute).mockResolvedValueOnce({
      kind: "page",
      document: { version: 1, blocks: [] },
      match: {
        kind: "page",
        params: {},
        redirectTo: null,
        redirectStatus: null,
        pageId: null,
        entryId: null,
        variantId: null,
        revision: 1,
        revisionState: "draft",
        draftRevision: 1,
        publishedRevision: 1,
      },
    });

    const out = await resolveEditorDocument({
      pathname: "/",
      context: { siteCtx: { siteId: "s1" } },
      locationSearch: { token: "demo" },
    });

    expect(out.pathname).toBe("/");
    expect(out.document).toEqual({ version: 1, blocks: [] });
  });

  it("throws 409 when API resolver returns a redirect", async () => {
    vi.mocked(resolvePortalRoute).mockResolvedValueOnce({
      kind: "redirect",
      to: "/about",
      status: 301,
    });

    await expect(
      resolveEditorDocument({
        pathname: "/old-about",
        context: { siteCtx: { siteId: "s1" } },
        locationSearch: { token: "demo" },
      }),
    ).rejects.toMatchObject({ name: "HttpError", status: 409 });
  });

  it("throws 404 when API resolver returns not_found", async () => {
    vi.mocked(resolvePortalRoute).mockResolvedValueOnce({
      kind: "not_found",
    });

    await expect(
      resolveEditorDocument({
        pathname: "/missing",
        context: { siteCtx: { siteId: "s1" } },
        locationSearch: { token: "demo" },
      }),
    ).rejects.toMatchObject({ name: "HttpError", status: 404 });
  });
});
