import { describe, expect, it } from "vitest";

import {
  buildNotificationsSourceSearch,
  validateNotificationsSourceSearch,
} from "@/lib/routing/notifications-source";

describe("inbox source search", () => {
  it("accepts allowed scene/path combinations and normalizes trailing slash", () => {
    expect(
      validateNotificationsSourceSearch({
        sourceKind: "workspace",
        sourcePath: "/w/ws-1/assets/",
      }),
    ).toEqual({
      sourceKind: "workspace",
      sourcePath: "/w/ws-1/assets",
    });

    expect(
      validateNotificationsSourceSearch({
        sourceKind: "account",
        sourcePath: "/settings/personal/profile/",
      }),
    ).toEqual({
      sourceKind: "account",
      sourcePath: "/settings/personal/profile",
    });

    expect(
      validateNotificationsSourceSearch({
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
      validateNotificationsSourceSearch({
        sourceKind: "workspace",
        sourcePath: "https://evil.example/steal",
      }),
    ).toEqual({});

    expect(
      validateNotificationsSourceSearch({
        sourceKind: "account",
        sourcePath: "//evil.example/steal",
      }),
    ).toEqual({});

    expect(
      validateNotificationsSourceSearch({
        sourceKind: "global",
        sourcePath: "/settings/personal/profile",
      }),
    ).toEqual({});
  });

  it("derives source context from supported paths only", () => {
    expect(buildNotificationsSourceSearch("/w/ws-1/assets/")).toEqual({
      sourceKind: "workspace",
      sourcePath: "/w/ws-1/assets",
    });
    expect(buildNotificationsSourceSearch("/settings/personal/profile/")).toEqual({
      sourceKind: "account",
      sourcePath: "/settings/personal/profile",
    });
    expect(buildNotificationsSourceSearch("/workspaces/")).toEqual({
      sourceKind: "global",
      sourcePath: "/workspaces",
    });
    expect(buildNotificationsSourceSearch("/login")).toEqual({});
  });
});
