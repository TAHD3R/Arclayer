import { describe, expect, test } from "vitest";

import { filterFoldersByContentCheck } from "./folderVisibility";

describe("folderVisibility", () => {
  test("filterFoldersByContentCheck keeps folders with true/undefined and removes folders with false", () => {
    const folders = [{ id: "a" }, { id: "b" }, { id: "c" }] as const;
    const hasMatch = new Map<string, boolean | undefined>([
      ["a", true],
      ["b", false],
      // "c" missing => treated as undefined (loading/unknown) => keep
    ]);

    const out = filterFoldersByContentCheck(folders, hasMatch);
    expect(out.map((f) => f.id)).toEqual(["a", "c"]);
  });
});
