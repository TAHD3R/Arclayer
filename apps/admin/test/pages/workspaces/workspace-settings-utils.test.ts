import { describe, expect, it } from "vitest";

import { resolveWorkspaceSettingsTabNavigation } from "@/pages/workspaces/settings/workspace/utils";

describe("resolveWorkspaceSettingsTabNavigation", () => {
  it("preserves favorite overlay content-only mode when switching tabs inside an overlay", () => {
    const navigation = resolveWorkspaceSettingsTabNavigation(
      "project-1",
      "content",
      "?arclayer_favorite_overlay=content-only",
    );

    expect(navigation.to).toBe("/projects/$projectId/seo/site");
    expect(navigation.params).toEqual({ projectId: "project-1" });
    expect(navigation.search?.({})).toEqual({
      arclayer_favorite_overlay: "content-only",
    });
  });

  it("does not add overlay search when the current route is not embedded", () => {
    const navigation = resolveWorkspaceSettingsTabNavigation("project-1", "basics");

    expect(navigation.to).toBe("/projects/$projectId/settings/general");
    expect(navigation.params).toEqual({ projectId: "project-1" });
    expect(navigation.search).toBeUndefined();
  });
});
