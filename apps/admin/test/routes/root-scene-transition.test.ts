import { describe, expect, it } from "vitest";

import { shouldUseSceneLoadingOverlay } from "@/routes/__root";

describe("root scene transition", () => {
  it("keeps global and admin shell switches inline", () => {
    expect(shouldUseSceneLoadingOverlay("global", "admin")).toBe(false);
    expect(shouldUseSceneLoadingOverlay("admin", "global")).toBe(false);
  });

  it("keeps fullscreen reveal for auth and invite scene switches", () => {
    expect(shouldUseSceneLoadingOverlay("auth", "admin")).toBe(true);
    expect(shouldUseSceneLoadingOverlay("invite", "global")).toBe(true);
  });
});
