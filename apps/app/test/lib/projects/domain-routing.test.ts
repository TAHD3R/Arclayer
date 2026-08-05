import { describe, expect, it } from "vitest";

import {
  resolveProjectPrimaryDomainUrl,
  selectResolvedProjectDomain,
  toOpenableProjectDomainUrl,
} from "@/lib/projects/domain-routing";

const binding = (
  hostname: string,
  overrides: Partial<{
    isActive: boolean;
    isPrimary: boolean;
    isVerified: boolean;
  }> = {},
) => ({
  hostname,
  isActive: true,
  isPrimary: false,
  isVerified: true,
  ...overrides,
});

describe("project domain routing projection", () => {
  it("prefers the active verified primary binding", () => {
    const domains = [
      binding("fallback.example.com"),
      binding("primary.example.com", { isPrimary: true }),
    ];

    expect(selectResolvedProjectDomain(domains)?.hostname).toBe("primary.example.com");
    expect(resolveProjectPrimaryDomainUrl(domains)).toBe("https://primary.example.com");
  });

  it("uses the first active verified binding when the primary cannot route", () => {
    const domains = [
      binding("disabled.example.com", { isActive: false, isPrimary: true }),
      binding("ready.example.com"),
    ];

    expect(selectResolvedProjectDomain(domains)?.hostname).toBe("ready.example.com");
  });

  it("does not turn pending or disabled bindings into a public address", () => {
    const domains = [
      binding("pending.example.com", { isPrimary: true, isVerified: false }),
      binding("disabled.example.com", { isActive: false }),
    ];

    expect(resolveProjectPrimaryDomainUrl(domains)).toBeNull();
  });

  it("keeps local platform URLs displayable but not externally openable", () => {
    const hostname = "Launch.ARCLAYER.LOCALHOST";

    expect(resolveProjectPrimaryDomainUrl([binding(hostname, { isPrimary: true })])).toBe(
      "https://launch.arclayer.localhost",
    );
    expect(toOpenableProjectDomainUrl(hostname)).toBeNull();
  });
});
