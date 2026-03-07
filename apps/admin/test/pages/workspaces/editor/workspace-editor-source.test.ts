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
  test("editor route now hands page editing off to studio", () => {
    const source = readFileSync(resolveSource("pages/workspaces/editor/handoff/page.tsx"), "utf-8");

    expect(source).toContain("WorkspaceEditorHandoffPage");
    expect(source).toContain("buildStudioPageEditorUrl");
    expect(source).toContain("window.location.replace");
  });
});
