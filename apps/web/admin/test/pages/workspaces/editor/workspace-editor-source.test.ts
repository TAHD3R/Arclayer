import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

function resolveSource(relativePath: string) {
  return resolve(thisDir, "../../../../src", relativePath);
}

describe("workspace editor source", () => {
  test("editor page renders layout shell", () => {
    const source = readFileSync(resolveSource("pages/workspaces/editor/page.tsx"), "utf-8");

    expect(source).toContain("EditorLayout");
    expect(source).toContain("WorkspaceEditorPage");
  });
});
