import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

function resolveSource(relativePath: string) {
  return resolve(thisDir, "../../src", relativePath);
}

describe("workspace content information architecture", () => {
  test("workspace content menu exposes Site Builder Content Library and Models", () => {
    const source = readFileSync(resolveSource("constants/menu/workspaces.ts"), "utf-8");

    expect(source).toContain('key: "content.siteBuilder"');
    expect(source).toContain('label: "Site Builder"');
    expect(source).toContain('to: "/content/site-builder"');

    expect(source).toContain('key: "content.library"');
    expect(source).toContain('label: "Content Library"');
    expect(source).toContain('to: "/content/library"');

    expect(source).toContain('key: "content.models"');
    expect(source).toContain('label: "Models"');
    expect(source).toContain('to: "/content/models"');

    expect(source).not.toContain('key: "content.pages"');
    expect(source).not.toContain('key: "content.all"');
    expect(source).not.toContain('key: "content.types"');
    expect(source).not.toContain("disabled: true");
  });

  test("workspace content routes exist for new IA entry points", () => {
    const siteBuilderRoute = resolveSource("routes/w/$workspaceId/content/site-builder/index.tsx");
    const siteBuilderLazyRoute = resolveSource(
      "routes/w/$workspaceId/content/site-builder/index.lazy.tsx",
    );
    const libraryRoute = resolveSource("routes/w/$workspaceId/content/library/index.tsx");
    const libraryLazyRoute = resolveSource("routes/w/$workspaceId/content/library/index.lazy.tsx");
    const modelsRoute = resolveSource("routes/w/$workspaceId/content/models/index.tsx");
    const modelsLazyRoute = resolveSource("routes/w/$workspaceId/content/models/index.lazy.tsx");

    expect(existsSync(siteBuilderRoute)).toBe(true);
    expect(existsSync(siteBuilderLazyRoute)).toBe(true);
    expect(existsSync(libraryRoute)).toBe(true);
    expect(existsSync(libraryLazyRoute)).toBe(true);
    expect(existsSync(modelsRoute)).toBe(true);
    expect(existsSync(modelsLazyRoute)).toBe(true);

    expect(readFileSync(siteBuilderRoute, "utf-8")).toContain(
      'createFileRoute("/w/$workspaceId/content/site-builder/")',
    );
    expect(readFileSync(libraryRoute, "utf-8")).toContain(
      'createFileRoute("/w/$workspaceId/content/library/")',
    );
    expect(readFileSync(modelsRoute, "utf-8")).toContain(
      'createFileRoute("/w/$workspaceId/content/models/")',
    );
  });

  test("legacy pages route no longer exists as a primary entry point", () => {
    const legacyPagesRoute = resolveSource("routes/w/$workspaceId/content/pages/index.tsx");
    const legacyPagesLazyRoute = resolveSource(
      "routes/w/$workspaceId/content/pages/index.lazy.tsx",
    );

    expect(existsSync(legacyPagesRoute)).toBe(false);
    expect(existsSync(legacyPagesLazyRoute)).toBe(false);
  });
});
