import { describe, expect, test } from "vitest";

import {
  buildDuplicatePath,
  normalizePathInput,
  validatePathWithType,
} from "@/pages/workspaces/content/pages/content-pages-utils";

describe("content pages utils", () => {
  test("normalizePathInput adds a leading slash", () => {
    expect(normalizePathInput("about")).toBe("/about");
  });

  test("validatePathWithType rejects static pages with params", () => {
    expect(validatePathWithType("/blog/:slug", "static")).toBe("type_mismatch");
  });

  test("buildDuplicatePath picks next available path", () => {
    const existing = new Set(["/about", "/about-copy", "/about-copy-2"]);
    expect(buildDuplicatePath("/about", existing)).toBe("/about-copy-3");
  });
});
