import { describe, expect, test } from "vitest";

import {
  applyPresetSelection,
  createEmptyShapeSelection,
  detachPreset,
  toggleCapabilityPack,
} from "@/pages/workspaces/content/bootstrap/state";

describe("content-bootstrap-state", () => {
  test("selecting a preset applies its recommended packs as selected", () => {
    expect(applyPresetSelection("page")).toEqual({
      presetKey: "page",
      presetState: "selected",
      capabilityPackIds: ["routable", "publishable", "seo_managed", "layout_bound"],
    });
  });

  test("toggling packs on a preset transitions it to customized", () => {
    const selection = toggleCapabilityPack(applyPresetSelection("post"), "seo_managed");

    expect(selection).toEqual({
      presetKey: "post",
      presetState: "customized",
      capabilityPackIds: ["publishable", "taxonomy_enabled", "schedulable"],
    });
  });

  test("detaching a preset keeps packs but resets preset identity", () => {
    const selection = detachPreset(applyPresetSelection("reusable-block"));

    expect(selection).toEqual({
      presetKey: null,
      presetState: "none",
      capabilityPackIds: ["reusable", "localizable"],
    });
  });

  test("manual packs without a preset stay in none state", () => {
    const selection = toggleCapabilityPack(createEmptyShapeSelection(), "publishable");

    expect(selection).toEqual({
      presetKey: null,
      presetState: "none",
      capabilityPackIds: ["publishable"],
    });
  });
});
