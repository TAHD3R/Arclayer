import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

function resolveSource(relativePath: string) {
  return resolve(thisDir, "../../src", relativePath);
}

describe("scene layout routing", () => {
  test("scene registry no longer assigns a dedicated editor layout", () => {
    const registrySource = readFileSync(resolveSource("lib/routing/scene-registry.ts"), "utf-8");

    expect(registrySource).not.toContain('import { EditorLayout } from "@/layouts/editor-layout"');
    expect(registrySource).not.toContain("isEditorPath");
    expect(registrySource).not.toContain("layout: EditorLayout");
    expect(registrySource).toContain('type SceneKey = "auth" | "invite" | "global" | "admin"');
  });

  test("root route uses scene registry for layout resolution", () => {
    const rootRouteSource = readFileSync(resolveSource("routes/__root.tsx"), "utf-8");

    expect(rootRouteSource).toContain("resolveSceneKey");
    expect(rootRouteSource).toContain("getSceneLayout");
  });

  test("route identity no longer defines a dedicated editor scene predicate", () => {
    const routeIdentitySource = readFileSync(
      resolveSource("lib/routing/route-identity.ts"),
      "utf-8",
    );

    expect(routeIdentitySource).not.toContain("isEditorPath");
  });
});
