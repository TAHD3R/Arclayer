import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

function resolveSource(relativePath: string) {
  return resolve(thisDir, "../../src", relativePath);
}

describe("workspace content and appearance routes", () => {
  test("legacy workspace content pages route has been removed", () => {
    const indexRoute = resolveSource("routes/w/$workspaceId/content/pages/index.tsx");
    const lazyRoute = resolveSource("routes/w/$workspaceId/content/pages/index.lazy.tsx");

    expect(existsSync(indexRoute)).toBe(false);
    expect(existsSync(lazyRoute)).toBe(false);
  });

  test("workspace content IA definitions remain even though route files are removed", () => {
    const menuSource = readFileSync(resolveSource("constants/menu/workspaces.ts"), "utf-8");
    const siteBuilderRoute = resolveSource("routes/w/$workspaceId/content/site-builder/index.tsx");
    const libraryRoute = resolveSource("routes/w/$workspaceId/content/library/index.tsx");
    const modelsRoute = resolveSource("routes/w/$workspaceId/content/models/index.tsx");

    expect(menuSource).toContain('to: "/content/site-builder"');
    expect(menuSource).toContain('to: "/content/library"');
    expect(menuSource).toContain('to: "/content/models"');

    expect(existsSync(siteBuilderRoute)).toBe(false);
    expect(existsSync(libraryRoute)).toBe(false);
    expect(existsSync(modelsRoute)).toBe(false);
  });

  test("workspace appearance routes have been removed", () => {
    const themesRoute = resolveSource("routes/w/$workspaceId/appearance/themes/index.tsx");
    const stylesRoute = resolveSource("routes/w/$workspaceId/appearance/styles/index.tsx");

    expect(existsSync(themesRoute)).toBe(false);
    expect(existsSync(stylesRoute)).toBe(false);
  });

  test("workspace editor route exists", () => {
    const editorRouteFile = resolveSource("routes/w/$workspaceId/editor/$editorMode/$entityId.tsx");
    const editorRouteSource = readFileSync(editorRouteFile, "utf-8");

    expect(existsSync(editorRouteFile)).toBe(true);
    expect(editorRouteSource).toContain(
      'createFileRoute("/w/$workspaceId/editor/$editorMode/$entityId")',
    );
    expect(editorRouteSource).toContain("validateSearch");
    expect(editorRouteSource).toContain("pathname");

    const lazyFile = resolveSource("routes/w/$workspaceId/editor/$editorMode/$entityId.lazy.tsx");
    const lazySource = readFileSync(lazyFile, "utf-8");
    expect(lazySource).toContain("WorkspaceEditorHandoffPage");
  });

  test("appearance navigation route has been removed", () => {
    const navRouteFile = resolveSource("routes/w/$workspaceId/appearance/navigation/index.tsx");
    expect(existsSync(navRouteFile)).toBe(false);
  });

  test("legacy workspace content page edit route file is still removed", () => {
    const editRouteFile = resolveSource("routes/w/$workspaceId/content/pages/$pageId/edit.tsx");

    expect(existsSync(editRouteFile)).toBe(false);
  });
});
