import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    post: vi.fn(),
  },
}));

import { testStorageProfile } from "@/api/storage-profiles";
import { api } from "@/lib/http";

describe("api/storage profile contracts", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({
      ok: true,
      status: "passed",
      message: "Connectivity check passed",
    });
  });

  it("tests environment-managed profiles through the by-key endpoint", async () => {
    await testStorageProfile({
      id: "e3cf0fc0-73b5-4c3a-aa85-a3dff5184868",
      profileKey: "env-default",
      configSource: "environment",
    });

    expect(api.post).toHaveBeenCalledWith("/system/storage-profiles/by-key/env-default/test");
  });

  it("tests database profiles by id even when their key resembles the environment profile", async () => {
    await testStorageProfile({
      id: "48c8c1c3-d41d-47c7-a9cc-b18bb69abfd3",
      profileKey: "env-default",
      configSource: "database",
    });

    expect(api.post).toHaveBeenCalledWith(
      "/system/storage-profiles/48c8c1c3-d41d-47c7-a9cc-b18bb69abfd3/test",
    );
  });
});
