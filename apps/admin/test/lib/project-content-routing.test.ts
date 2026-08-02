import { beforeEach, describe, expect, test } from "vitest";

import {
  buildProjectContentEditorUrl,
  projectContentLibraryPath,
} from "@/lib/routing/project-content-routing";

describe("project-content-routing", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/projects/project-1/content/library?view=draft#shape");
  });

  test("builds the canonical project content library path", () => {
    expect(projectContentLibraryPath("project 1")).toBe("/projects/project%201/content/library");
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

    expect(url).toContain(
      "returnTo=%2Fprojects%2Fproject-1%2Fcontent%2Flibrary%3Fview%3Ddraft%23shape",
    );
  });

  test("drops unsafe returnTo values", () => {
    const url = buildProjectContentEditorUrl({
      siteId: "site-1",
      itemId: "item-1",
      token: "preview-token",
      returnTo: "//evil.example/phish",
    });

    expect(url).not.toContain("evil.example");
    expect(url).toContain(
      "returnTo=%2Fprojects%2Fproject-1%2Fcontent%2Flibrary%3Fview%3Ddraft%23shape",
    );
  });
});
