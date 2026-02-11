import { describe, expect, test } from "vitest";

import { resolveSetupGateRedirect } from "@/lib/setup-routing";

describe("resolveSetupGateRedirect", () => {
  test("redirects /setup to /login in saas mode", () => {
    const to = resolveSetupGateRedirect({
      deploymentMode: "saas",
      initialized: true,
      pathname: "/setup",
      devAllowSetup: false,
    });

    expect(to).toBe("/login");
  });

  test("forces self-host uninitialized users into /setup", () => {
    const to = resolveSetupGateRedirect({
      deploymentMode: "self_host",
      initialized: false,
      pathname: "/settings/general",
      devAllowSetup: false,
    });

    expect(to).toBe("/setup");
  });

  test("hides /setup after self-host setup is complete", () => {
    const to = resolveSetupGateRedirect({
      deploymentMode: "self_host",
      initialized: true,
      pathname: "/setup",
      devAllowSetup: false,
    });

    expect(to).toBe("/login");
  });

  test("allows /setup when dev override is enabled", () => {
    const to = resolveSetupGateRedirect({
      deploymentMode: "self_host",
      initialized: true,
      pathname: "/setup",
      devAllowSetup: true,
    });

    expect(to).toBeNull();
  });

  test("keeps legacy self-host fallback when mode is unknown", () => {
    const to = resolveSetupGateRedirect({
      deploymentMode: null,
      initialized: false,
      pathname: "/",
      devAllowSetup: false,
    });

    expect(to).toBe("/setup");
  });
});
