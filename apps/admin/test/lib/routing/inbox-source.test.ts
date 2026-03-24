import { describe, expect, it } from "vitest";

import { buildInboxSourceSearch, validateInboxSourceSearch } from "@/lib/routing/inbox-source";

describe("inbox source search", () => {
  it("accepts allowed scene/path combinations and normalizes trailing slash", () => {
    expect(
      validateInboxSourceSearch({
        sourceKind: "workspace",
        sourcePath: "/w/ws-1/assets/",
      }),
    ).toEqual({
      sourceKind: "workspace",
      sourcePath: "/w/ws-1/assets",
    });

    expect(
      validateInboxSourceSearch({
        sourceKind: "account",
        sourcePath: "/account/profile/",
      }),
    ).toEqual({
      sourceKind: "account",
      sourcePath: "/account/profile",
    });

    expect(
      validateInboxSourceSearch({
        sourceKind: "global",
        sourcePath: "/workspaces/",
      }),
    ).toEqual({
      sourceKind: "global",
      sourcePath: "/workspaces",
    });
  });

  it("rejects external urls and mismatched prefixes", () => {
    expect(
      validateInboxSourceSearch({
        sourceKind: "workspace",
        sourcePath: "https://evil.example/steal",
      }),
    ).toEqual({});

    expect(
      validateInboxSourceSearch({
        sourceKind: "account",
        sourcePath: "//evil.example/steal",
      }),
    ).toEqual({});

    expect(
      validateInboxSourceSearch({
        sourceKind: "global",
        sourcePath: "/account/profile",
      }),
    ).toEqual({});
  });

  it("derives source context from supported paths only", () => {
    expect(buildInboxSourceSearch("/w/ws-1/assets/")).toEqual({
      sourceKind: "workspace",
      sourcePath: "/w/ws-1/assets",
    });
    expect(buildInboxSourceSearch("/account/profile/")).toEqual({
      sourceKind: "account",
      sourcePath: "/account/profile",
    });
    expect(buildInboxSourceSearch("/workspaces/")).toEqual({
      sourceKind: "global",
      sourcePath: "/workspaces",
    });
    expect(buildInboxSourceSearch("/login")).toEqual({});
  });
});
