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
  test("workspace content pages route uses content pages view", () => {
    const source = readFileSync(
      resolveSource("routes/w/$workspaceId/content/pages/index.tsx"),
      "utf-8",
    );

    expect(source).toContain(
      'import { ContentPagesIndexView } from "@/pages/workspaces/content/pages/page"',
    );
    expect(source).toContain("component: ContentPagesIndexView");
  });

  test("workspace content library route uses content library view", () => {
    const source = readFileSync(
      resolveSource("routes/w/$workspaceId/content/library/index.tsx"),
      "utf-8",
    );

    expect(source).toContain(
      'import { ContentLibraryView } from "@/pages/workspaces/content/library/page"',
    );
    expect(source).toContain("component: ContentLibraryView");
  });

  test("workspace themes and styles routes use dedicated pages", () => {
    const themesSource = readFileSync(
      resolveSource("routes/w/$workspaceId/appearance/themes/index.tsx"),
      "utf-8",
    );
    const stylesSource = readFileSync(
      resolveSource("routes/w/$workspaceId/appearance/styles/index.tsx"),
      "utf-8",
    );

    expect(themesSource).toContain(
      'import { WorkspaceThemesView } from "@/pages/workspaces/appearance/themes/page"',
    );
    expect(stylesSource).toContain(
      'import { WorkspaceGlobalStylesView } from "@/pages/workspaces/appearance/styles/page"',
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
    expect(editorRouteSource).toContain("WorkspaceEditorView");
  });

  test("appearance navigation route redirects to content pages", () => {
    const source = readFileSync(
      resolveSource("routes/w/$workspaceId/appearance/navigation/index.tsx"),
      "utf-8",
    );

    expect(source).toContain("redirect({");
    expect(source).toContain('to: "/w/$workspaceId/content/pages"');
  });

  test("legacy workspace content page edit route file is still removed", () => {
    const editRouteFile = resolveSource("routes/w/$workspaceId/content/pages/$pageId/edit.tsx");

    expect(existsSync(editRouteFile)).toBe(false);
  });
});
