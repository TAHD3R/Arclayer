import { beforeEach, describe, expect, it } from "vitest";

import {
  consumePlatformSessionNotice,
  getPlatformAccessToken,
  readPlatformSession,
  savePlatformSession,
} from "@/auth/platform-session";
import type { PlatformSessionIssuedOut } from "@arclayer/platform-openapi";

const NOW = Date.now();

function issuedSession(expiresIn = 600): PlatformSessionIssuedOut {
  return {
    state: "authenticated",
    credential: {
      accessToken: "platform-access-only",
      expiresIn,
      session: {
        absoluteExpiresAt: new Date(NOW + 3_600_000).toISOString(),
        actorId: "platform-actor",
        isInstanceOwner: false,
        operatorId: "platform-operator",
        policyRevision: 3,
        sessionId: "platform-session",
      },
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("Platform Session persistence", () => {
  it("stores only the independently issued Platform credential and restores it", () => {
    savePlatformSession(issuedSession(), NOW);

    expect(readPlatformSession(NOW + 1_000)).toMatchObject({
      accessToken: "platform-access-only",
      principal: { sessionId: "platform-session" },
    });
    expect(getPlatformAccessToken()).toBe("platform-access-only");
    expect(window.localStorage.getItem("arclayer:platform:session")).not.toContain("workspace");
  });

  it("clears access-token expiry and exposes an explicit re-entry notice", () => {
    savePlatformSession(issuedSession(10), NOW);

    expect(readPlatformSession(NOW + 10_001)).toBeNull();
    expect(window.localStorage.getItem("arclayer:platform:session")).toBeNull();
    expect(consumePlatformSessionNotice()).toBe("expired");
  });

  it("rejects corrupt persisted state instead of treating it as authenticated", () => {
    window.localStorage.setItem("arclayer:platform:session", "not-json");

    expect(readPlatformSession(NOW)).toBeNull();
    expect(consumePlatformSessionNotice()).toBe("revoked");
  });
});
