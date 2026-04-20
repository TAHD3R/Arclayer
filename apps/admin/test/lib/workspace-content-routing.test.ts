import { beforeEach, describe, expect, test } from "vitest";

import {
  buildProjectContentEditorUrl,
  projectContentCreatePath,
  projectContentLibraryPath,
} from "@/lib/routing/project-content-routing";

describe("workspace-content-routing", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/projects/project-1/content/create?step=2#shape");
  });

  test("builds workspace content library and create paths", () => {
    expect(projectContentLibraryPath("ws 1")).toBe("/projects/ws%201/content/library");
    expect(projectContentCreatePath("ws 1")).toBe("/projects/ws%201/content/create");
  });

  test("builds editor handoff url with explicit safe returnTo", () => {
    const url = buildProjectContentEditorUrl({
      siteId: "site-1",
      itemId: "item-1",
      token: "preview-token",
      returnTo: "/projects/project-1/content/library?scope=draft",
    });

    expect(url).toBe(
      "/editor/site/site-1?token=preview-token&source=admin&itemId=item-1&returnTo=%2Fprojects%2Fproject-1%2Fcontent%2Flibrary%3Fscope%3Ddraft",
    );
  });

  test("falls back to current admin location when returnTo is omitted", () => {
    const url = buildProjectContentEditorUrl({
      siteId: "site-1",
      itemId: "item-1",
      token: "preview-token",
    });

    expect(url).toContain("returnTo=%2Fprojects%2Fproject-1%2Fcontent%2Fcreate%3Fstep%3D2%23shape");
  });

  test("drops unsafe returnTo values", () => {
    const url = buildProjectContentEditorUrl({
      siteId: "site-1",
      itemId: "item-1",
      token: "preview-token",
      returnTo: "//evil.example/phish",
    });

    expect(url).not.toContain("evil.example");
    expect(url).toContain("returnTo=%2Fprojects%2Fproject-1%2Fcontent%2Fcreate%3Fstep%3D2%23shape");
  });
});
