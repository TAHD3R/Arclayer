import { describe, expect, it } from "vitest";

import { resolveWorkspaceSettingsTabNavigation } from "@/pages/workspaces/settings/workspace/utils";

describe("resolveWorkspaceSettingsTabNavigation", () => {
  it("preserves favorite overlay content-only mode when switching tabs inside an overlay", () => {
    const navigation = resolveWorkspaceSettingsTabNavigation(
      "ws-1",
      "content",
      "?arclayer_favorite_overlay=content-only",
    );

    expect(navigation.to).toBe("/settings/workspace/general");
    expect(navigation.search?.({})).toEqual({
      arclayer_favorite_overlay: "content-only",
    });
  });

  it("does not add overlay search when the current route is not embedded", () => {
    const navigation = resolveWorkspaceSettingsTabNavigation("ws-1", "danger");

    expect(navigation.to).toBe("/settings/workspace/general");
    expect(navigation.search).toBeUndefined();
  });
});
