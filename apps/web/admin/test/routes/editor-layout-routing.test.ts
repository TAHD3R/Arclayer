import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

function resolveSource(relativePath: string) {
  return resolve(thisDir, "../../src", relativePath);
}

describe("editor layout routing", () => {
  test("root route uses dedicated editor layout for workspace editor paths", () => {
    const rootRouteSource = readFileSync(resolveSource("routes/__root.tsx"), "utf-8");

    expect(rootRouteSource).toContain("import { EditorLayout } from \"@/layouts/editor-layout\"");
    expect(rootRouteSource).toContain("const isEditorRoute = /^\\/w\\/[^/]+\\/editor(?:\\/|$)/.test(pathname)");
    expect(rootRouteSource).toContain("<EditorLayout>");
  });
});
