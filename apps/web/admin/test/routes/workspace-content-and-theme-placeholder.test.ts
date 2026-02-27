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
  test("workspace content pages route uses lazy-loaded content pages page", () => {
    const source = readFileSync(
      resolveSource("routes/w/$workspaceId/content/pages/index.lazy.tsx"),
      "utf-8",
    );

    expect(source).toContain(
      'import { ContentPagesIndexPage } from "@/pages/workspaces/content/pages/page"',
    );
    expect(source).toContain("component: ContentPagesIndexPage");
  });

  test("workspace content library route uses lazy-loaded content library page", () => {
    const source = readFileSync(
      resolveSource("routes/w/$workspaceId/content/library/index.lazy.tsx"),
      "utf-8",
    );

    expect(source).toContain(
      'import { ContentLibraryPage } from "@/pages/workspaces/content/library/page"',
    );
    expect(source).toContain("component: ContentLibraryPage");
  });

  test("workspace themes and styles routes use dedicated lazy-loaded pages", () => {
    const themesSource = readFileSync(
      resolveSource("routes/w/$workspaceId/appearance/themes/index.lazy.tsx"),
      "utf-8",
    );
    const stylesSource = readFileSync(
      resolveSource("routes/w/$workspaceId/appearance/styles/index.lazy.tsx"),
      "utf-8",
    );

    expect(themesSource).toContain(
      'import { WorkspaceThemesPage } from "@/pages/workspaces/appearance/themes/page"',
    );
    expect(stylesSource).toContain(
      'import { WorkspaceGlobalStylesPage } from "@/pages/workspaces/appearance/styles/page"',
    );
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
    expect(lazySource).toContain("WorkspaceEditorPage");
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
