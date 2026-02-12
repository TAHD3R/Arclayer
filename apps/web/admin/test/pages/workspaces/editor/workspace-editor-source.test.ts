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
  test("editor page wires bridge and draft lifecycle", () => {
    const source = readFileSync(resolveSource("pages/workspaces/editor/page.tsx"), "utf-8");

    expect(source).toContain("createEditorHostConnector");
    expect(source).toContain("saveWorkspaceSitePageDraft");
    expect(source).toContain("publishWorkspaceSitePage");
    expect(source).toContain("EDITOR_SHELL_SAVE_SHORTCUT_HINT");
  });
});
