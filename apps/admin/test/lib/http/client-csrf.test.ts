import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/http/client";
import { useAuthStore } from "@/stores/use-auth-store";

describe("admin API CSRF transport", () => {
  beforeEach(() => {
    document.cookie = "csrf_token=token-123; path=/";
    useAuthStore.getState().setTokens(null);
  });

  afterEach(() => {
    document.cookie = "csrf_token=; Max-Age=0; path=/";
    vi.restoreAllMocks();
  });

  it("adds the CSRF header to unsafe Admin API requests", async () => {
    const fetchMock = vi.fn<FetchMock>(async () => jsonResponse({ data: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/workspaces/ws-id/settings", {
      method: "PATCH",
      body: { name: "Updated" },
    });

    const init = getFetchInit(fetchMock);
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("token-123");
  });

  it("keeps safe Admin API requests without a CSRF header", async () => {
    const fetchMock = vi.fn<FetchMock>(async () => jsonResponse({ data: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/workspaces/ws-id", { method: "GET" });

    const init = getFetchInit(fetchMock);
    expect(new Headers(init.headers).has("X-CSRF-Token")).toBe(false);
  });

  it("adds the CSRF header when refreshing with the session cookie", async () => {
    const fetchMock = vi.fn<FetchMock>(async (_input, init) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return jsonResponse({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
      }
      return jsonResponse({
        data: {
          access_token: "access-token",
          refresh_token: null,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/me", { method: "GET" })).rejects.toMatchObject({
      status: 401,
    });

    const refreshInit = getFetchInit(fetchMock, 1);
    expect(new Headers(refreshInit.headers).get("X-CSRF-Token")).toBe("token-123");
  });
});

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function getFetchInit(fetchMock: ReturnType<typeof vi.fn<FetchMock>>, callIndex = 0): RequestInit {
  const call = fetchMock.mock.calls[callIndex];
  expect(call).toBeDefined();
  const init = call?.[1];
  expect(init).toBeDefined();
  return init ?? {};
}

function jsonResponse(
  body: { data?: unknown; error?: string | null; message?: string },
  init: ResponseInit = {},
): Response {
  return new Response(
    JSON.stringify({
      timestamp: "2026-04-30T00:00:00Z",
      message: "OK",
      error: null,
      meta: null,
      ...body,
    }),
    {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    },
  );
}
