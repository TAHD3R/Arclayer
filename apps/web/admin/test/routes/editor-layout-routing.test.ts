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
  test("scene registry includes editor layout with correct predicate", () => {
    const registrySource = readFileSync(resolveSource("lib/routing/scene-registry.ts"), "utf-8");

    expect(registrySource).toContain('import { EditorLayout } from "@/layouts/editor-layout"');
    expect(registrySource).toContain("isEditorPath");
    expect(registrySource).toContain("layout: EditorLayout");
  });

  test("root route uses scene registry for layout resolution", () => {
    const rootRouteSource = readFileSync(resolveSource("routes/__root.tsx"), "utf-8");

    expect(rootRouteSource).toContain("resolveSceneKey");
    expect(rootRouteSource).toContain("getSceneLayout");
  });

  test("isEditorPath regex matches workspace editor paths", () => {
    const routeIdentitySource = readFileSync(
      resolveSource("lib/routing/route-identity.ts"),
      "utf-8",
    );

    expect(routeIdentitySource).toContain(
      "return /^\\/w\\/[^/]+\\/editor(?:\\/|$)/.test(pathname)",
    );
  });
});
