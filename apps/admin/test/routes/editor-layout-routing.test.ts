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
  test("scene registry assigns the project creation editor to its fullscreen layout", () => {
    const registrySource = readFileSync(resolveSource("lib/routing/scene-registry.ts"), "utf-8");

    expect(registrySource).toContain('import { CreationLayout } from "@/layouts/creation-layout"');
    expect(registrySource).toContain("isCreationEditorPath");
    expect(registrySource).toContain('key: "creation", layout: CreationLayout');
    expect(registrySource).toContain(
      'type SceneKey = "auth" | "invite" | "creation" | "global" | "admin"',
    );
  });

  test("root route uses scene registry for layout resolution", () => {
    const rootRouteSource = readFileSync(resolveSource("routes/__root.tsx"), "utf-8");

    expect(rootRouteSource).toContain("resolveSceneKey");
    expect(rootRouteSource).toContain("getSceneLayout");
  });

  test("route identity scopes the creation scene to project editor routes", () => {
    const routeIdentitySource = readFileSync(
      resolveSource("lib/routing/route-identity.ts"),
      "utf-8",
    );

    expect(routeIdentitySource).toContain("export function isCreationEditorPath");
    expect(routeIdentitySource).toContain("/^\\/projects\\/[^/]+\\/editor");
  });
});
